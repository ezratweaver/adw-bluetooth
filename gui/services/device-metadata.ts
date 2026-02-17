/**
 * Bluetooth device metadata utilities
 * Includes service UUIDs and device type classification
 */

export function getDeviceTypeFromClass(cod: number): string {
    const major = (cod >> 8) & 0x1f;
    const minor = (cod >> 2) & 0x3f;

    switch (major) {
        case 0x01: // Computer
            switch (minor) {
                case 0x03:
                    return "Laptop";
                case 0x04:
                    return "Handheld PC/PDA";
                case 0x06:
                    return "Wearable Computer";
                default:
                    return "Computer";
            }

        case 0x02: // Phone
            switch (minor) {
                case 0x01:
                    return "Cellular Phone";
                case 0x03:
                    return "Smartphone";
                default:
                    return "Phone";
            }

        case 0x04: // Audio/Video
            switch (minor) {
                case 0x01:
                    return "Headset";
                case 0x08:
                    return "Speaker";
                case 0x0c:
                    return "Headphones";
                case 0x10:
                    return "Portable Audio";
                case 0x14:
                    return "Car Audio";
                default:
                    return "Audio Device";
            }

        case 0x05:
            return "Peripheral";
        case 0x06:
            return "Imaging Device";
        case 0x07:
            return "Wearable";
        case 0x08:
            return "Toy";
        case 0x09:
            return "Health Device";
        default:
            return "Unknown Device";
    }
}

export enum BluetoothUUID {
    // Audio/Media Services
    AUDIO_SINK = "0000110b-0000-1000-8000-00805f9b34fb",
    AUDIO_SOURCE = "0000110a-0000-1000-8000-00805f9b34fb",
    HEADSET = "00001108-0000-1000-8000-00805f9b34fb",
    HEADSET_AG = "00001112-0000-1000-8000-00805f9b34fb",
    HANDS_FREE = "0000111e-0000-1000-8000-00805f9b34fb",
    HANDS_FREE_AG = "0000111f-0000-1000-8000-00805f9b34fb",
    ADVANCED_AUDIO_DISTRIBUTION = "0000110d-0000-1000-8000-00805f9b34fb",
    AUDIO_VIDEO_REMOTE_CONTROL = "0000110e-0000-1000-8000-00805f9b34fb",
    AUDIO_VIDEO_REMOTE_CONTROL_TARGET = "0000110c-0000-1000-8000-00805f9b34fb",

    // Input Services
    HUMAN_INTERFACE_DEVICE = "00001124-0000-1000-8000-00805f9b34fb",

    // File Transfer Services
    OBJECT_PUSH = "00001105-0000-1000-8000-00805f9b34fb",
    FILE_TRANSFER = "00001106-0000-1000-8000-00805f9b34fb",

    // Network Services
    NETWORK_ACCESS_POINT = "00001116-0000-1000-8000-00805f9b34fb",
    GROUP_NETWORK = "00001117-0000-1000-8000-00805f9b34fb",

    // Serial Services
    SERIAL_PORT = "00001101-0000-1000-8000-00805f9b34fb",
    DIAL_UP_NETWORKING = "00001103-0000-1000-8000-00805f9b34fb",

    // Common GATT Services
    GENERIC_ACCESS = "00001800-0000-1000-8000-00805f9b34fb",
    GENERIC_ATTRIBUTE = "00001801-0000-1000-8000-00805f9b34fb",
    DEVICE_INFORMATION = "0000180a-0000-1000-8000-00805f9b34fb",
    BATTERY_SERVICE = "0000180f-0000-1000-8000-00805f9b34fb",

    // Phone Services
    PHONE_BOOK_ACCESS = "0000112f-0000-1000-8000-00805f9b34fb",
    MESSAGE_ACCESS = "00001134-0000-1000-8000-00805f9b34fb",
    MESSAGE_NOTIFICATION = "00001132-0000-1000-8000-00805f9b34fb",

    // Other Services
    PNP_INFORMATION = "00001200-0000-1000-8000-00805f9b34fb",
    IRMC_SYNC = "00001104-0000-1000-8000-00805f9b34fb",
}