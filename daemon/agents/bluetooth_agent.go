package agents

import "github.com/godbus/dbus/v5"

const (
	agentPath      = "/com/ezratweaver/AdwBluetooth/agent"
	agentInterface = "org.bluez.Agent1"
)

type BluetoothAgent struct {
	SysConnection *dbus.Conn
}

// TODO: Actually implement this
func (agent *BluetoothAgent) RequestPinCode(device dbus.ObjectPath) (string, *dbus.Error) {
	return "0000", nil
}

// TODO: Implement rest of agent functions

func RegisterBluetoothAgent(bluezObject dbus.BusObject, sysConnection *dbus.Conn) error {
	bluetoothAgent := &BluetoothAgent{SysConnection: sysConnection}

	err := sysConnection.Export(bluetoothAgent, agentPath, agentInterface)
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