package service

import (
	"log"

	"github.com/ezratweaver/adw-bluetooth/daemon/agents"
	"github.com/ezratweaver/adw-bluetooth/daemon/config"
	"github.com/ezratweaver/adw-bluetooth/daemon/connection"
	"github.com/godbus/dbus/v5"
)

type AdwBluetoothDaemon struct {
	adapters      map[dbus.ObjectPath]Adapter
	devices       map[dbus.ObjectPath]Device
	limboDevices  map[dbus.ObjectPath]Device
	activeAdapter dbus.ObjectPath
}

func (daemon *AdwBluetoothDaemon) ConfirmRequest(accepted bool) *dbus.Error {
	if agents.CurrBluetoothAgent.RequestConfirmChannel == nil {
		return dbus.NewError(config.NoPendingRequestError, []any{"no confirmation request is pending"})
	}
	agents.CurrBluetoothAgent.RequestConfirmChannel <- accepted
	return nil
}

func (daemon *AdwBluetoothDaemon) ConfirmAuthorization(accepted bool) *dbus.Error {
	if agents.CurrBluetoothAgent.RequestAuthorizationChannel == nil {
		return dbus.NewError(config.NoPendingRequestError, []any{"no authorization request is pending"})
	}
	agents.CurrBluetoothAgent.RequestAuthorizationChannel <- accepted
	return nil
}

func (daemon *AdwBluetoothDaemon) GetDevices() ([]Device, *dbus.Error) {
	devices := make([]Device, 0, len(daemon.devices))
	for _, d := range daemon.devices {
		devices = append(devices, d)
	}
	return devices, nil
}

func (daemon *AdwBluetoothDaemon) GetAdapters() ([]Adapter, *dbus.Error) {
	adapters := make([]Adapter, 0, len(daemon.adapters))
	for _, a := range daemon.adapters {
		adapters = append(adapters, a)
	}
	return adapters, nil
}

func (daemon *AdwBluetoothDaemon) GetActiveAdapter() (Adapter, *dbus.Error) {
	a, ok := daemon.adapters[daemon.activeAdapter]
	if !ok {
		return Adapter{}, dbus.NewError("org.freedesktop.DBus.Error.Failed", []any{"no active adapter"})
	}
	return a, nil
}

func (daemon *AdwBluetoothDaemon) SetActiveAdapter(path dbus.ObjectPath) *dbus.Error {
	if _, ok := daemon.adapters[path]; !ok {
		return dbus.NewError("org.freedesktop.DBus.Error.InvalidArgs", []any{"adapter not found"})
	}

	daemon.activeAdapter = path

	result, err := getManagedObjects()
	if err != nil {
		log.Printf("Failed to reload devices for new adapter: %v", err)
		return dbus.NewError("org.freedesktop.DBus.Error.Failed", []any{"failed to reload devices"})
	}

	oldDevices := daemon.devices

	daemon.loadDevicesForAdapter(result)

	connection.EmitDaemonSignal("AdapterUpdated", daemon.adapters[path])

	for devicePath := range oldDevices {
		connection.EmitDaemonSignal("DeviceRemoved", devicePath)
	}

	for _, device := range daemon.devices {
		connection.EmitDaemonSignal("DeviceAdded", device)
	}

	return nil
}

func (daemon *AdwBluetoothDaemon) ConnectDevice(path dbus.ObjectPath) *dbus.Error {
	callErr := connection.SysConnection.Object("org.bluez", path).Call("org.bluez.Device1.Connect", 0).Err
	if callErr != nil {
		log.Printf("Failed to connect device %s: %v", path, callErr)
		return dbus.NewError("org.bluez.Error.Failed", []any{callErr.Error()})
	}
	return nil
}

func (daemon *AdwBluetoothDaemon) DisconnectDevice(path dbus.ObjectPath) *dbus.Error {
	callErr := connection.SysConnection.Object("org.bluez", path).Call("org.bluez.Device1.Disconnect", 0).Err
	if callErr != nil {
		log.Printf("Failed to disconnect device %s: %v", path, callErr)
		return dbus.NewError("org.bluez.Error.Failed", []any{callErr.Error()})
	}
	return nil
}

func (daemon *AdwBluetoothDaemon) PairDevice(path dbus.ObjectPath) *dbus.Error {
	callErr := connection.SysConnection.Object("org.bluez", path).Call("org.bluez.Device1.Pair", 0).Err
	if callErr != nil {
		log.Printf("Failed to pair device %s: %v", path, callErr)
		return dbus.NewError("org.bluez.Error.Failed", []any{callErr.Error()})
	}
	return nil
}

func (daemon *AdwBluetoothDaemon) RemoveDevice(path dbus.ObjectPath) *dbus.Error {
	callErr := connection.SysConnection.Object("org.bluez", daemon.activeAdapter).Call("org.bluez.Adapter1.RemoveDevice", 0, path).Err
	if callErr != nil {
		log.Printf("Failed to remove device %s: %v", path, callErr)
		return dbus.NewError("org.bluez.Error.Failed", []any{callErr.Error()})
	}
	return nil
}

func (daemon *AdwBluetoothDaemon) SetTrusted(path dbus.ObjectPath, trusted bool) *dbus.Error {
	callErr := connection.SysConnection.Object("org.bluez", path).Call(
		"org.freedesktop.DBus.Properties.Set", 0,
		"org.bluez.Device1", "Trusted", dbus.MakeVariant(trusted),
	).Err
	if callErr != nil {
		log.Printf("Failed to set trusted on device %s: %v", path, callErr)
		return dbus.NewError("org.bluez.Error.Failed", []any{callErr.Error()})
	}
	return nil
}

func (daemon *AdwBluetoothDaemon) StartDiscovery() *dbus.Error {
	obj := connection.SysConnection.Object("org.bluez", daemon.activeAdapter)

	if callErr := obj.Call("org.bluez.Adapter1.StartDiscovery", 0).Err; callErr != nil {
		log.Printf("Failed to start discovery: %v", callErr)
		return dbus.NewError("org.bluez.Error.Failed", []any{callErr.Error()})
	}

	if callErr := obj.Call("org.freedesktop.DBus.Properties.Set", 0,
		"org.bluez.Adapter1", "Discoverable", dbus.MakeVariant(true),
	).Err; callErr != nil {
		log.Printf("Failed to set discoverable: %v", callErr)
	}

	return nil
}

func (daemon *AdwBluetoothDaemon) StopDiscovery() *dbus.Error {
	obj := connection.SysConnection.Object("org.bluez", daemon.activeAdapter)

	if callErr := obj.Call("org.bluez.Adapter1.StopDiscovery", 0).Err; callErr != nil {
		log.Printf("Failed to stop discovery: %v", callErr)
		return dbus.NewError("org.bluez.Error.Failed", []any{callErr.Error()})
	}

	if callErr := obj.Call("org.freedesktop.DBus.Properties.Set", 0,
		"org.bluez.Adapter1", "Discoverable", dbus.MakeVariant(false),
	).Err; callErr != nil {
		log.Printf("Failed to unset discoverable: %v", callErr)
	}

	return nil
}

func (daemon *AdwBluetoothDaemon) SetAdapterPower(powered bool) *dbus.Error {
	callErr := connection.SysConnection.Object("org.bluez", daemon.activeAdapter).Call(
		"org.freedesktop.DBus.Properties.Set", 0,
		"org.bluez.Adapter1", "Powered", dbus.MakeVariant(powered),
	).Err
	if callErr != nil {
		log.Printf("Failed to set adapter power: %v", callErr)
		return dbus.NewError("org.bluez.Error.Failed", []any{callErr.Error()})
	}
	return nil
}

func NewAdwBluetoothDaemon() *AdwBluetoothDaemon {
	daemon := &AdwBluetoothDaemon{}

	daemon.initializeAdaptersAndDevices()
	daemon.startBlueZListener()

	return daemon
}
