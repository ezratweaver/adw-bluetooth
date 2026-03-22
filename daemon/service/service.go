package service

import (
	"github.com/ezratweaver/adw-bluetooth/daemon/agents"
	"github.com/godbus/dbus/v5"
)

type AdwBluetoothDaemon struct {
}

func (daemon *AdwBluetoothDaemon) ConfirmRequest(accepted bool) *dbus.Error {
	if agents.ActiveBluetoothAgent.ConfirmChannel != nil {
		agents.ActiveBluetoothAgent.ConfirmChannel <- accepted
	}

	return nil
}