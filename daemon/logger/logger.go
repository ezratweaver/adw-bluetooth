package logger

import (
	"log/slog"
	"os"
)

// L is the shared logger used throughout the daemon. Call Init before use.
var L *slog.Logger

// Init sets up the package-level logger. Pass debug=true to enable DEBUG-level
// output; otherwise only INFO and above are emitted.
func Init(debug bool) {
	level := slog.LevelInfo
	if debug {
		level = slog.LevelDebug
	}

	handler := slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: level,
	})

	L = slog.New(handler)
}
