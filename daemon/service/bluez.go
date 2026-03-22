package service

import (
	"log"
	"slices"
	"strings"

	"github.com/ezratweaver/adw-bluetooth/daemon/connection"
	"github.com/godbus/dbus/v5"
)

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

	if !strings.HasPrefix(string(path), "/org/bluez/") {
		return
	}

	interfaces, ok := signal.Body[1].(map[string]map[string]dbus.Variant)
	if !ok {
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

	if err := connection.EmitDaemonSignal("DeviceAdded", d.toDBusStruct()); err != nil {
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
		if err := connection.EmitDaemonSignal("DeviceUpdated", d.toDBusStruct()); err != nil {
			log.Printf("Failed to emit DeviceUpdated: %v", err)
		}
	}
}

func (daemon *AdwBluetoothDaemon) initializeAdaptersAndDevices() {
	daemon.adapters = make(map[dbus.ObjectPath]Adapter)
	daemon.devices = make(map[dbus.ObjectPath]Device)

	bluezRootObj := connection.SysConnection.Object("org.bluez", "/")

	result := make(map[dbus.ObjectPath]map[string]map[string]dbus.Variant)
	err := bluezRootObj.Call("org.freedesktop.DBus.ObjectManager.GetManagedObjects", 0).Store(&result)
	if err != nil {
		log.Fatalf("Failed to introspect objects from bluez: %v", err)
	}

	for path, interfaces := range result {

		if strings.HasPrefix(string(path), "/org/bluez/") {

			adapter, isAdapter := interfaces["org.bluez.Adapter1"]
			device, isDevice := interfaces["org.bluez.Device1"]

			if isAdapter {
				daemon.adapters[path] = Adapter{
					Path:        path,
					Alias:       adapter["Alias"].Value().(string),
					Powered:     adapter["Powered"].Value().(bool),
					Discovering: adapter["Discovering"].Value().(bool),
				}
			}

			if isDevice {
				name, _ := device["Name"].Value().(string)
				if name == "" {
					continue
				}

				daemon.devices[path] = deviceFromProps(path, device, interfaces)
			}

		}
	}
}