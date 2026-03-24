package agents

import (
	"github.com/ezratweaver/adw-bluetooth/daemon/config"
	"github.com/ezratweaver/adw-bluetooth/daemon/connection"
	"github.com/ezratweaver/adw-bluetooth/daemon/logger"
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
	logger.L.Info("DisplayPinCode", "device", device, "pincode", pincode)
	connection.EmitDaemonSignal("DisplayPinCode", device, pincode)
	return nil
}

func (agent *BluetoothAgent) DisplayPasskey(device dbus.ObjectPath, passkey uint32, entered uint16) *dbus.Error {
	logger.L.Info("DisplayPasskey", "device", device, "passkey", passkey, "entered", entered)
	connection.EmitDaemonSignal("DisplayPasskey", device, passkey, entered)
	return nil
}

// emits a signal, waits for ConfirmRequest, on the AdwBluetoothDaemon to be called
func (agent *BluetoothAgent) RequestConfirmation(device dbus.ObjectPath, passkey uint32) *dbus.Error {
	logger.L.Info("RequestConfirmation: waiting for user response", "device", device, "passkey", passkey)
	agent.RequestConfirmChannel = make(chan bool, 1)

	connection.EmitDaemonSignal("RequestConfirmation", device, passkey)

	accepted := <-agent.RequestConfirmChannel // wait for response

	agent.RequestConfirmChannel = nil // reset back to nil

	if !accepted {
		logger.L.Info("RequestConfirmation rejected", "device", device)
		return dbus.NewError(config.BluezRejectedError, nil)
	}

	logger.L.Info("RequestConfirmation accepted", "device", device)
	return nil
}

// emits a signal, waits for ConfirmAuthorization, on the AdwBluetoothDaemon to be called
func (agent *BluetoothAgent) RequestAuthorization(device dbus.ObjectPath) *dbus.Error {
	logger.L.Info("RequestAuthorization: waiting for user response", "device", device)
	agent.RequestAuthorizationChannel = make(chan bool, 1)

	connection.EmitDaemonSignal("RequestAuthorization", device)

	accepted := <-agent.RequestAuthorizationChannel

	agent.RequestAuthorizationChannel = nil

	if !accepted {
		logger.L.Info("RequestAuthorization rejected", "device", device)
		return dbus.NewError(config.BluezRejectedError, nil)
	}

	logger.L.Info("RequestAuthorization accepted", "device", device)
	return nil
}

func (agent *BluetoothAgent) AuthorizeService(device dbus.ObjectPath, uuid string) *dbus.Error {
	// When a bluetooth peripheral requests for access to a specifc service, this gets called
	// Most modern bluetooth managers accept by default, so thats what we'll do.
	logger.L.Debug("AuthorizeService auto-accepted", "device", device, "uuid", uuid)
	return nil
}

func (agent *BluetoothAgent) Cancel() *dbus.Error {
	logger.L.Info("Agent Cancel called: cancelling pending requests")
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
	if err != nil {
		return err
	}

	logger.L.Info("Bluetooth agent registered", "path", agentPath)
	return nil
}

func UnregisterBluetoothAgent() error {
	err := connection.BluezObject.Call("org.bluez.AgentManager1.UnregisterAgent", 0, agentPath).Err
	if err != nil {
		return err
	}
	logger.L.Info("Bluetooth agent unregistered")
	return nil
}
