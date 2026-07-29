package internal

import "go.bug.st/serial"

// ListPorts returns the available serial/USB ports on this machine, e.g.
// ["COM3", "COM4"] on Windows.
func ListPorts() ([]string, error) {
	return serial.GetPortsList()
}
