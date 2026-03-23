package service

import (
	"log"

	"github.com/ezratweaver/adw-bluetooth/daemon/agents"
	"github.com/ezratweaver/adw-bluetooth/daemon/connection"
	"github.com/godbus/dbus/v5"
)

type AdwBluetoothDaemon struct {
	adapters      map[dbus.ObjectPath]Adapter
	devices       map[dbus.ObjectPath]Device
	activeAdapter dbus.ObjectPath
}

func (daemon *AdwBluetoothDaemon) ConfirmRequest(accepted bool) *dbus.Error {
	if agents.CurrBluetoothAgent.RequestConfirmChannel != nil {
		agents.CurrBluetoothAgent.RequestConfirmChannel <- accepted
	}

	return nil
}

func (daemon *AdwBluetoothDaemon) ConfirmAuthorization(accepted bool) *dbus.Error {
	if agents.CurrBluetoothAgent.RequestAuthorizationChannel != nil {
		agents.CurrBluetoothAgent.RequestAuthorizationChannel <- accepted
	}

	return nil
}

func (daemon *AdwBluetoothDaemon) GetDevices() ([]any, *dbus.Error) {
	devices := make([]any, 0, len(daemon.devices))
	for _, d := range daemon.devices {
		devices = append(devices, d.toDBusStruct())
	}
	return devices, nil
}

func (daemon *AdwBluetoothDaemon) GetAdapters() ([]any, *dbus.Error) {
	adapters := make([]any, 0, len(daemon.adapters))
	for _, a := range daemon.adapters {
		adapters = append(adapters, a.toDBusStruct())
	}
	return adapters, nil
}

func (daemon *AdwBluetoothDaemon) GetActiveAdapter() (any, *dbus.Error) {
	a, ok := daemon.adapters[daemon.activeAdapter]
	if !ok {
		return nil, dbus.NewError("org.freedesktop.DBus.Error.Failed", []any{"no active adapter"})
	}
	return a.toDBusStruct(), nil
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

	daemon.loadDevicesForAdapter(result)

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

func NewAdwBluetoothDaemon() *AdwBluetoothDaemon {
	daemon := &AdwBluetoothDaemon{}

	daemon.initializeAdaptersAndDevices()
	daemon.startBlueZListener()

	return daemon
}