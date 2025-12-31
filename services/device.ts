export const requestDeviceOrientationPermission = async (): Promise<boolean> => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        try {
            const permissionState = await (DeviceOrientationEvent as any).requestPermission();
            return permissionState === 'granted';
        } catch (error) {
            console.error('Error requesting device orientation permission:', error);
            return false;
        }
    } else {
        // Non-iOS 13+ devices typically don't need permission or prompt automatically
        return true;
    }
};
