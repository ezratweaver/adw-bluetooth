package service

import (
	"slices"
	"strings"

	"github.com/ezratweaver/adw-bluetooth/daemon/connection"
	"github.com/ezratweaver/adw-bluetooth/daemon/logger"
	"github.com/godbus/dbus/v5"
)

type managedObjects = map[dbus.ObjectPath]map[string]map[string]dbus.Variant

func getManagedObjects() (managedObjects, error) {
	bluezRootObj := connection.SysConnection.Object("org.bluez", "/")
	result := make(managedObjects)
	err := bluezRootObj.Call("org.freedesktop.DBus.ObjectManager.GetManagedObjects", 0).Store(&result)
	return result, err
}

func (daemon *AdwBluetoothDaemon) startBlueZListener() {
	// Subscribe to new device discovered
	connection.SysConnection.BusObject().Call(
		"org.freedesktop.DBus.AddMatch", 0,
		"type='signal',sender='org.bluez',interface='org.freedesktop.DBus.ObjectManager',member='InterfacesAdded'",
	)

	// Subscribe to device removed
	connection.SysConnection.BusObject().Call(
		"org.freedesktop.DBus.AddMatch", 0,
		"type='signal',sender='org.bluez',interface='org.freedesktop.DBus.ObjectManager',member='InterfacesRemoved'",
	)

	// Subscribe to device or battery property updated
	connection.SysConnection.BusObject().Call(
		"org.freedesktop.DBus.AddMatch", 0,
		"type='signal',sender='org.bluez',interface='org.freedesktop.DBus.Properties',member='PropertiesChanged'",
	)

	ch := make(chan *dbus.Signal, 16)
	connection.SysConnection.Signal(ch)

	logger.L.Debug("BlueZ signal listener started")

	go func() {
		for signal := range ch {
			switch signal.Name {
			case "org.freedesktop.DBus.ObjectManager.InterfacesAdded":
				daemon.handleInterfacesAdded(signal)
			case "org.freedesktop.DBus.ObjectManager.InterfacesRemoved":
				daemon.handleInterfacesRemoved(signal)
			case "org.freedesktop.DBus.Properties.PropertiesChanged":
				daemon.handlePropertiesChanged(signal)
			}
		}
	}()
}

func (daemon *AdwBluetoothDaemon) handleInterfacesAdded(signal *dbus.Signal) {
	if len(signal.Body) < 2 {
		return
	}

	path, ok := signal.Body[0].(dbus.ObjectPath)
	if !ok {
		return
	}

	interfaces, ok := signal.Body[1].(map[string]map[string]dbus.Variant)
	if !ok {
		return
	}

	if props, isAdapter := interfaces["org.bluez.Adapter1"]; isAdapter {
		a := adapterFromProps(path, props)
		daemon.adapters[path] = a
		logger.L.Info("Adapter added", "path", path, "alias", a.Alias)
		connection.EmitDaemonSignal("AdapterAdded", a)
	}

	// if its an interface of the current adapter
	if strings.HasPrefix(string(path), string(daemon.activeAdapter)+"/") {

		if device, isDevice := interfaces["org.bluez.Device1"]; isDevice {
			d := deviceFromProps(path, device, interfaces)
			name, _ := device["Name"].Value().(string)
			if name == "" {
				daemon.limboDevices[path] = d
				logger.L.Debug("Device added to limbo (no name yet)", "path", path)
			} else {
				daemon.devices[path] = d
				logger.L.Info("Device added", "path", path, "name", d.Name, "mac", d.MAC)
				connection.EmitDaemonSignal("DeviceAdded", d)
			}
		}

		if battery, hasBattery := interfaces["org.bluez.Battery1"]; hasBattery {
			if existingDevice, exists := daemon.devices[path]; exists {
				if pct, ok := battery["Percentage"].Value().(byte); ok {
					existingDevice.BatteryPercentage = int16(pct)
					daemon.devices[path] = existingDevice
					connection.EmitDaemonSignal("DeviceUpdated", existingDevice)
					logger.L.Debug("Battery interface added to device", "path", path, "battery", pct)
				}
			}
		}
	}

}

func (daemon *AdwBluetoothDaemon) handleInterfacesRemoved(signal *dbus.Signal) {
	if len(signal.Body) < 2 {
		return
	}

	path, ok := signal.Body[0].(dbus.ObjectPath)
	if !ok {
		return
	}

	interfaces, ok := signal.Body[1].([]string)
	if !ok {
		return
	}

	if slices.Contains(interfaces, "org.bluez.Adapter1") {
		delete(daemon.adapters, path)
		logger.L.Info("Adapter removed", "path", path)
		connection.EmitDaemonSignal("AdapterRemoved", path)
	}

	if slices.Contains(interfaces, "org.bluez.Device1") {
		if _, isLimboDevice := daemon.limboDevices[path]; isLimboDevice {
			delete(daemon.limboDevices, path)
			logger.L.Debug("Limbo device removed", "path", path)
		} else {
			delete(daemon.devices, path)
			logger.L.Info("Device removed", "path", path)
			connection.EmitDaemonSignal("DeviceRemoved", path)
		}
	}

	if slices.Contains(interfaces, "org.bluez.Battery1") {
		if existingDevice, exists := daemon.devices[path]; exists {
			existingDevice.BatteryPercentage = -1
			daemon.devices[path] = existingDevice
			connection.EmitDaemonSignal("DeviceUpdated", existingDevice)
			logger.L.Debug("Battery interface removed from device", "path", path)
		}
	}
}

func (daemon *AdwBluetoothDaemon) handlePropertiesChanged(signal *dbus.Signal) {
	if len(signal.Body) < 2 {
		return
	}

	path := signal.Path

	if !strings.HasPrefix(string(path), "/org/bluez/") {
		return
	}

	iface, ok := signal.Body[0].(string)
	if !ok {
		return
	}

	changed, ok := signal.Body[1].(map[string]dbus.Variant)
	if !ok {
		return
	}

	if iface == "org.bluez.Adapter1" {
		a, exists := daemon.adapters[path]
		if !exists {
			return
		}
		updated := false
		if v, ok := changed["Alias"].Value().(string); ok && a.Alias != v {
			a.Alias = v
			updated = true
		}
		if v, ok := changed["Powered"].Value().(bool); ok && a.Powered != v {
			a.Powered = v
			updated = true
			logger.L.Info("Adapter power changed", "path", path, "powered", v)
		}
		if v, ok := changed["Discovering"].Value().(bool); ok && a.Discovering != v {
			a.Discovering = v
			updated = true
			logger.L.Info("Adapter discovery changed", "path", path, "discovering", v)
		}
		if updated {
			daemon.adapters[path] = a
			connection.EmitDaemonSignal("AdapterUpdated", a)
		}
		return
	}

	if !strings.HasPrefix(string(path), string(daemon.activeAdapter)+"/") {
		return
	}

	device, isNormal := daemon.devices[path]
	limboDevice, isLimbo := daemon.limboDevices[path]

	switch {
	case isNormal && isLimbo:
		logger.L.Warn("Device exists as both limbo and regular", "path", path)
		return
	case !isNormal && !isLimbo:
		return
	case isLimbo:
		device = limboDevice
	}

	updated := false

	switch iface {
	case "org.bluez.Device1":
		if v, ok := changed["Name"].Value().(string); ok && device.Name != v {
			device.Name = v
			updated = true
		}
		if v, ok := changed["Alias"].Value().(string); ok && device.Alias != v {
			device.Alias = v
			updated = true
		}
		if v, ok := changed["Connected"].Value().(bool); ok && device.Connected != v {
			device.Connected = v
			updated = true
			logger.L.Info("Device connection changed", "path", path, "connected", v)
		}
		if v, ok := changed["Paired"].Value().(bool); ok && device.Paired != v {
			device.Paired = v
			updated = true
			logger.L.Info("Device paired changed", "path", path, "paired", v)
		}
		if v, ok := changed["Trusted"].Value().(bool); ok && device.Trusted != v {
			device.Trusted = v
			updated = true
			logger.L.Debug("Device trusted changed", "path", path, "trusted", v)
		}
		if v, ok := changed["Class"].Value().(uint32); ok && device.Class != v {
			device.Class = v
			updated = true
		}
		if v, ok := changed["Icon"].Value().(string); ok && device.Icon != v {
			device.Icon = v
			updated = true
		}
		if v, ok := changed["UUIDs"].Value().([]string); ok {
			device.UUIDs = v
			updated = true
		}

	case "org.bluez.Battery1":
		if v, ok := changed["Percentage"].Value().(byte); ok {
			device.BatteryPercentage = int16(v)
			updated = true
			logger.L.Debug("Device battery updated", "path", path, "battery", v)
		}
	}

	// If its a regular device update, just update
	if updated && isNormal {
		daemon.devices[path] = device
		connection.EmitDaemonSignal("DeviceUpdated", device)
	}

	// If its a limbo device that changed, see if it finally has a name
	// if it does, promote it to a regular device
	newName, nameWasChanged := changed["Name"].Value().(string)
	if isLimbo && nameWasChanged && newName != "" {
		daemon.devices[path] = device

		delete(daemon.limboDevices, path)

		logger.L.Info("Limbo device promoted", "path", path, "name", newName)
		connection.EmitDaemonSignal("DeviceAdded", device)
	}
}

func (daemon *AdwBluetoothDaemon) initializeAdaptersAndDevices() {
	daemon.adapters = make(map[dbus.ObjectPath]Adapter)

	result, err := getManagedObjects()
	if err != nil {
		logger.L.Error("Failed to get managed objects from BlueZ", "err", err)
		panic(err)
	}

	for path, interfaces := range result {
		props, isAdapter := interfaces["org.bluez.Adapter1"]
		if !isAdapter {
			continue
		}
		daemon.adapters[path] = adapterFromProps(path, props)
		if daemon.activeAdapter == "" {
			daemon.activeAdapter = path
			logger.L.Info("Active adapter set", "path", path)
		}
	}

	logger.L.Info("Adapters initialized", "count", len(daemon.adapters))

	daemon.loadDevicesForAdapter(result)
}

func (daemon *AdwBluetoothDaemon) loadDevicesForAdapter(mangedObjects managedObjects) {
	daemon.devices = make(map[dbus.ObjectPath]Device)
	daemon.limboDevices = make(map[dbus.ObjectPath]Device)

	for path, interfaces := range mangedObjects {
		if !strings.HasPrefix(string(path), string(daemon.activeAdapter)+"/") {
			continue
		}

		device, isDevice := interfaces["org.bluez.Device1"]
		if !isDevice {
			continue
		}

		deviceObj := deviceFromProps(path, device, interfaces)
		if deviceObj.Name == "" {
			// they don't have a name yet, but they may later be updated
			// with a name so we'll keep track anyway
			daemon.limboDevices[path] = deviceObj
		} else {
			daemon.devices[path] = deviceObj
		}
	}

	logger.L.Info("Devices loaded for adapter",
		"adapter", daemon.activeAdapter,
		"devices", len(daemon.devices),
		"limbo", len(daemon.limboDevices),
	)
}