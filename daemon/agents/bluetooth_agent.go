package agents

import (
	"github.com/ezratweaver/adw-bluetooth/daemon/config"
	"github.com/ezratweaver/adw-bluetooth/daemon/connection"
	"github.com/godbus/dbus/v5"
)

const (
	agentPath      dbus.ObjectPath = "/com/ezratweaver/AdwBluetooth/agent"
	agentInterface string          = "org.bluez.Agent1"
)

type BluetoothAgent struct {
	RequestConfirmChannel       chan bool
	RequestAuthorizationChannel chan bool
}

func (agent *BluetoothAgent) DisplayPinCode(device dbus.ObjectPath, pincode string) *dbus.Error {
	connection.EmitDaemonSignal("DisplayPinCode", device, pincode)
	return nil
}

func (agent *BluetoothAgent) DisplayPasskey(device dbus.ObjectPath, passkey uint32, entered uint16) *dbus.Error {
	connection.EmitDaemonSignal("DisplayPasskey", device, passkey, entered)
	return nil
}

// emits a signal, waits for ConfirmRequest, on the AdwBluetoothDaemon to be called
func (agent *BluetoothAgent) RequestConfirmation(device dbus.ObjectPath, passkey uint32) *dbus.Error {
	agent.RequestConfirmChannel = make(chan bool, 1)

	connection.EmitDaemonSignal("RequestConfirmation", device, passkey)

	accepted := <-agent.RequestConfirmChannel // wait for response

	agent.RequestConfirmChannel = nil // reset back to nil

	if !accepted {
		return dbus.NewError(config.BluezRejectedError, nil)
	}

	return nil
}

// emits a signal, waits for ConfirmAuthorization, on the AdwBluetoothDaemon to be called
func (agent *BluetoothAgent) RequestAuthorization(device dbus.ObjectPath) *dbus.Error {
	agent.RequestAuthorizationChannel = make(chan bool, 1)

	connection.EmitDaemonSignal("RequestAuthorization", device)

	accepted := <-agent.RequestAuthorizationChannel

	agent.RequestAuthorizationChannel = nil

	if !accepted {
		return dbus.NewError(config.BluezRejectedError, nil)
	}

	return nil
}

func (agent *BluetoothAgent) AuthorizeService(device dbus.ObjectPath, uuid string) *dbus.Error {
	// When a bluetooth peripheral requests for access to a specifc service, this gets called
	// Most modern bluetooth managers accept by default, so thats what we'll do.
	return nil
}

func (agent *BluetoothAgent) Cancel() *dbus.Error {
	if agent.RequestConfirmChannel != nil {
		agent.RequestConfirmChannel <- false // cancel confirm if we're waiting on it
	}
	if agent.RequestAuthorizationChannel != nil {
		agent.RequestAuthorizationChannel <- false
	}

	return nil
}

var CurrBluetoothAgent *BluetoothAgent

func RegisterBluetoothAgent() error {
	CurrBluetoothAgent = &BluetoothAgent{}

	err := connection.SysConnection.Export(CurrBluetoothAgent, agentPath, agentInterface)
	if err != nil {
		return err

	}
	err = connection.BluezObject.Call("org.bluez.AgentManager1.RegisterAgent", 0, agentPath, "DisplayYesNo").Err
	if err != nil {
		return err
	}

	err = connection.BluezObject.Call("org.bluez.AgentManager1.RequestDefaultAgent", 0, agentPath).Err

	return err
}

func UnregisterBluetoothAgent() error {
	err := connection.BluezObject.Call("org.bluez.AgentManager1.UnregisterAgent", 0, agentPath).Err

	return err
}
