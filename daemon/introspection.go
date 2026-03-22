package main

import "github.com/godbus/dbus/v5/introspect"

var ServiceNode = &introspect.Node{
	Name: ObjectPath,
	Interfaces: []introspect.Interface{
		introspect.IntrospectData,
		{
			Name:    Iface,
			Methods: []introspect.Method{
				// Example method
				// {
				// 	Name: "Hello",
				// 	Args: []introspect.Arg{
				// 		{Name: "name", Type: "s", Direction: "in"},
				// 		{Name: "greeting", Type: "s", Direction: "out"},
				// 	},
				// },
			},
		},
	},
}