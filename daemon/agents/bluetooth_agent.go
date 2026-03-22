package agents

import "github.com/godbus/dbus/v5"

const (
	agentPath      = "/com/ezratweaver/AdwBluetooth/agent"
	agentInterface = "org.bluez.Agent1"
)

type BluetoothAgent struct {
	SysConnection *dbus.Conn
}

func (agent *BluetoothAgent) RequestPinCode(device dbus.ObjectPath) (string, *dbus.Error) {
	return "0000", nil
}

func (agent *BluetoothAgent) DisplayPinCode(device dbus.ObjectPath, pincode string) *dbus.Error {
	return nil
}

func (agent *BluetoothAgent) RequestPasskey(device dbus.ObjectPath) (uint32, *dbus.Error) {
	return 0, nil
}

func (agent *BluetoothAgent) DisplayPasskey(device dbus.ObjectPath, passkey uint32, entered uint16) *dbus.Error {
	return nil
}

func (agent *BluetoothAgent) RequestConfirmation(device dbus.ObjectPath, passkey uint32) *dbus.Error {
	return nil
}

func (agent *BluetoothAgent) RequestAuthorization(device dbus.ObjectPath) *dbus.Error {
	return nil
}

func (agent *BluetoothAgent) AuthorizeService(device dbus.ObjectPath, uuid string) *dbus.Error {
	return nil
}

func (agent *BluetoothAgent) Cancel() *dbus.Error {
	return nil
}

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