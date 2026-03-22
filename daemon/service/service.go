package service

import (
	"github.com/ezratweaver/adw-bluetooth/daemon/agents"
	"github.com/godbus/dbus/v5"
)

type AdwBluetoothDaemon struct {
	adapters map[dbus.ObjectPath]Adapter
	devices  map[dbus.ObjectPath]Device
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

func NewAdwBluetoothDaemon() *AdwBluetoothDaemon {
	daemon := &AdwBluetoothDaemon{}

	daemon.initializeAdaptersAndDevices()
	daemon.startBlueZListener()

	return daemon
}