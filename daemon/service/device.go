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

func deviceFromProps(path dbus.ObjectPath, device map[string]dbus.Variant, interfaces map[string]map[string]dbus.Variant) Device {
	mac, _ := device["Address"].Value().(string)
	name, _ := device["Name"].Value().(string)
	alias, _ := device["Alias"].Value().(string)
	paired, _ := device["Paired"].Value().(bool)
	connected, _ := device["Connected"].Value().(bool)
	trusted, _ := device["Trusted"].Value().(bool)
	class, _ := device["Class"].Value().(uint32)
	icon, _ := device["Icon"].Value().(string)
	uuids, _ := device["UUIDs"].Value().([]string)

	batteryPercentage := int16(-1)
	if battery, hasBattery := interfaces["org.bluez.Battery1"]; hasBattery {
		if pct, ok := battery["Percentage"].Value().(byte); ok {
			batteryPercentage = int16(pct)
		}
	}

	return Device{
		Path:              path,
		MAC:               mac,
		Name:              name,
		Alias:             alias,
		Connected:         connected,
		Paired:            paired,
		Trusted:           trusted,
		Class:             class,
		Icon:              icon,
		UUIDs:             uuids,
		BatteryPercentage: batteryPercentage,
	}
}