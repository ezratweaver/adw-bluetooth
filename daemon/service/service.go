package service

import (
	"log"
	"strings"

	"github.com/ezratweaver/adw-bluetooth/daemon/agents"
	"github.com/ezratweaver/adw-bluetooth/daemon/connection"
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
	adapters := make(map[dbus.ObjectPath]Adapter)
	devices := make(map[dbus.ObjectPath]Device)

	bluezRootObj := connection.SysConnection.Object("org.bluez", "/")

	result := make(map[dbus.ObjectPath]map[string]map[string]dbus.Variant)
	err := bluezRootObj.Call("org.freedesktop.DBus.ObjectManager.GetManagedObjects", 0).Store(&result)
	if err != nil {
		log.Fatalf("Failed to introspect objects from bluez: %v", err)
	}

	for path, interfaces := range result {

		if strings.HasPrefix(string(path), "/org/bluez/") {

			adapter, isAdapter := interfaces["org.bluez.Adapter1"]
			device, isDevice := interfaces["org.bluez.Device1"]

			if isAdapter {
				adapters[path] = Adapter{
					Path:        path,
					Alias:       adapter["Alias"].Value().(string),
					Powered:     adapter["Powered"].Value().(bool),
					Discovering: adapter["Discovering"].Value().(bool),
				}
			}

			if isDevice {
				name, _ := device["Name"].Value().(string)
				if name == "" {
					continue
				}

				mac, _ := device["Address"].Value().(string)
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

				devices[path] = Device{
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

		}
	}

	return &AdwBluetoothDaemon{
		adapters: adapters,
		devices:  devices,
	}
}
