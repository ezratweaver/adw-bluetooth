package agents

import (
	"github.com/ezratweaver/adw-bluetooth/daemon/config"
	"github.com/ezratweaver/adw-bluetooth/daemon/connection"
	"github.com/godbus/dbus/v5"
)

const (
	agentPath      = "/com/ezratweaver/AdwBluetooth/agent"
	agentInterface = "org.bluez.Agent1"
)

type BluetoothAgent struct {
	ConfirmChannel chan bool
}

func (agent *BluetoothAgent) DisplayPinCode(device dbus.ObjectPath, pincode string) *dbus.Error {
	connection.EmitDaemonSignal("DisplayPinCode", device, pincode)
	return nil
}

func (agent *BluetoothAgent) DisplayPasskey(device dbus.ObjectPath, passkey uint32, entered uint16) *dbus.Error {
	connection.EmitDaemonSignal("DisplayPasskey", device, passkey, entered)
	return nil
}

func (agent *BluetoothAgent) RequestConfirmation(device dbus.ObjectPath, passkey uint32) *dbus.Error {
	agent.ConfirmChannel = make(chan bool, 1)

	connection.EmitDaemonSignal("RequestConfirmation", device, passkey)

	accepted := <-agent.ConfirmChannel // wait for response

	agent.ConfirmChannel = nil // reset back to nil

	if !accepted {
		return dbus.NewError(config.BluezRejectedError, nil)
	}

	return nil
}

func (agent *BluetoothAgent) RequestAuthorization(device dbus.ObjectPath) *dbus.Error {
	return nil
}

func (agent *BluetoothAgent) AuthorizeService(device dbus.ObjectPath, uuid string) *dbus.Error {
	// When a bluetooth peripheral requests for access to a specifc service, this gets called
	// Most modern bluetooth managers accept by default, so thats what we'll do.
	return nil
}

func (agent *BluetoothAgent) Cancel() *dbus.Error {
	if agent.ConfirmChannel != nil {
		agent.ConfirmChannel <- false // cancel confirm if we're waiting on it
	}
	return nil
}

var ActiveBluetoothAgent *BluetoothAgent

func RegisterBluetoothAgent(bluezObject dbus.BusObject) error {
	ActiveBluetoothAgent = &BluetoothAgent{}

	err := connection.SysConnection.Export(ActiveBluetoothAgent, agentPath, agentInterface)
	if err != nil {
		return err

	}
	err = bluezObject.Call("org.bluez.AgentManager1.RegisterAgent", 0, agentPath, "DisplayYesNo").Err
	if err != nil {
		return err
	}

	err = bluezObject.Call("org.bluez.AgentManager1.RequestDefaultAgent", 0, agentPath).Err

	return err
}

func UnregisterBluetoothAgent(bluezObject dbus.BusObject) error {
	err := bluezObject.Call("org.bluez.AgentManager1.UnregisterAgent", 0, agentPath).Err

	return err
}