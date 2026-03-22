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