package service

import (
	"log"
	"slices"
	"strings"

	"github.com/ezratweaver/adw-bluetooth/daemon/connection"
	"github.com/godbus/dbus/v5"
)

type managedObjects = map[dbus.ObjectPath]map[string]map[string]dbus.Variant

func getManagedObjects() (managedObjects, error) {
	bluezRootObj := connection.SysConnection.Object("org.bluez", "/")
	result := make(managedObjects)
	err := bluezRootObj.Call("org.freedesktop.DBus.ObjectManager.GetManagedObjects", 0).Store(&result)
	return result, err
}

func adapterFromProps(path dbus.ObjectPath, props map[string]dbus.Variant) Adapter {
	alias, _ := props["Alias"].Value().(string)
	powered, _ := props["Powered"].Value().(bool)
	discovering, _ := props["Discovering"].Value().(bool)
	return Adapter{
		Path:        path,
		Alias:       alias,
		Powered:     powered,
		Discovering: discovering,
	}
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
		if err := connection.EmitDaemonSignal("AdapterAdded", a); err != nil {
			log.Printf("Failed to emit AdapterAdded: %v", err)
		}
		return
	}

	if !strings.HasPrefix(string(path), string(daemon.activeAdapter)+"/") {
		return
	}

	device, isDevice := interfaces["org.bluez.Device1"]
	if !isDevice {
		return
	}

	name, _ := device["Name"].Value().(string)
	if name == "" {
		return
	}

	d := deviceFromProps(path, device, interfaces)
	daemon.devices[path] = d

	if err := connection.EmitDaemonSignal("DeviceAdded", d); err != nil {
		log.Printf("Failed to emit DeviceAdded: %v", err)
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
		if err := connection.EmitDaemonSignal("AdapterRemoved", path); err != nil {
			log.Printf("Failed to emit AdapterRemoved: %v", err)
		}
		return
	}

	if !slices.Contains(interfaces, "org.bluez.Device1") {
		return
	}

	delete(daemon.devices, path)

	if err := connection.EmitDaemonSignal("DeviceRemoved", path); err != nil {
		log.Printf("Failed to emit DeviceRemoved: %v", err)
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
		}
		if v, ok := changed["Discovering"].Value().(bool); ok && a.Discovering != v {
			a.Discovering = v
			updated = true
		}
		if updated {
			daemon.adapters[path] = a
			if err := connection.EmitDaemonSignal("AdapterUpdated", a); err != nil {
				log.Printf("Failed to emit AdapterUpdated: %v", err)
			}
		}
		return
	}

	if !strings.HasPrefix(string(path), string(daemon.activeAdapter)+"/") {
		return
	}

	d, exists := daemon.devices[path]
	if !exists {
		return
	}

	updated := false

	switch iface {
	case "org.bluez.Device1":
		if v, ok := changed["Name"].Value().(string); ok && d.Name != v {
			d.Name = v
			updated = true
		}
		if v, ok := changed["Alias"].Value().(string); ok && d.Alias != v {
			d.Alias = v
			updated = true
		}
		if v, ok := changed["Connected"].Value().(bool); ok && d.Connected != v {
			d.Connected = v
			updated = true
		}
		if v, ok := changed["Paired"].Value().(bool); ok && d.Paired != v {
			d.Paired = v
			updated = true
		}
		if v, ok := changed["Trusted"].Value().(bool); ok && d.Trusted != v {
			d.Trusted = v
			updated = true
		}
		if v, ok := changed["Class"].Value().(uint32); ok && d.Class != v {
			d.Class = v
			updated = true
		}
		if v, ok := changed["Icon"].Value().(string); ok && d.Icon != v {
			d.Icon = v
			updated = true
		}
		if v, ok := changed["UUIDs"].Value().([]string); ok {
			d.UUIDs = v
			updated = true
		}

	case "org.bluez.Battery1":
		if v, ok := changed["Percentage"].Value().(byte); ok {
			d.BatteryPercentage = int16(v)
			updated = true
		}
	}

	if updated {
		daemon.devices[path] = d
		if err := connection.EmitDaemonSignal("DeviceUpdated", d); err != nil {
			log.Printf("Failed to emit DeviceUpdated: %v", err)
		}
	}
}

func (daemon *AdwBluetoothDaemon) initializeAdaptersAndDevices() {
	daemon.adapters = make(map[dbus.ObjectPath]Adapter)
	daemon.devices = make(map[dbus.ObjectPath]Device)

	result, err := getManagedObjects()
	if err != nil {
		log.Fatalf("Failed to get managed objects from bluez: %v", err)
	}

	for path, interfaces := range result {
		props, isAdapter := interfaces["org.bluez.Adapter1"]
		if !isAdapter {
			continue
		}
		daemon.adapters[path] = adapterFromProps(path, props)
		if daemon.activeAdapter == "" {
			daemon.activeAdapter = path
		}
	}

	daemon.loadDevicesForAdapter(result)
}

func (daemon *AdwBluetoothDaemon) loadDevicesForAdapter(mangedObjects managedObjects) {
	daemon.devices = make(map[dbus.ObjectPath]Device)

	for path, interfaces := range mangedObjects {
		if !strings.HasPrefix(string(path), string(daemon.activeAdapter)+"/") {
			continue
		}

		device, isDevice := interfaces["org.bluez.Device1"]
		if !isDevice {
			continue
		}

		name, _ := device["Name"].Value().(string)
		if name == "" {
			continue
		}

		daemon.devices[path] = deviceFromProps(path, device, interfaces)
	}
}
