package service

import "github.com/godbus/dbus/v5"

type Device struct {
	Path              dbus.ObjectPath // internal, never sent to GUI
	MAC               string
	Name              string
	Alias             string
	Connected         bool
	Paired            bool
	Trusted           bool
	Class             uint32
	Icon              string
	UUIDs             []string
	BatteryPercentage int16 // -1 = unavailable
}

// return struct as any for DBus
func (d Device) toDBusStruct() any {
	return struct {
		Path              dbus.ObjectPath
		MAC               string
		Name              string
		Alias             string
		Connected         bool
		Paired            bool
		Trusted           bool
		Class             uint32
		Icon              string
		UUIDs             []string
		BatteryPercentage int16
	}{
		d.Path, d.MAC, d.Name, d.Alias,
		d.Connected, d.Paired, d.Trusted,
		d.Class, d.Icon, d.UUIDs, d.BatteryPercentage,
	}
}