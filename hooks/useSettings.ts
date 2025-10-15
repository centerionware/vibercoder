import { useState, useEffect } from 'react';
import { AppSettings } from '../types';
import { DEFAULT_SETTINGS } from '../app/config';
import { safeLocalStorage } from '../utils/environment';

const SETTINGS_KEY = 'vibecode_settings';

export const useSettings = () => {
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);

    // Load settings from localStorage on initial mount
    useEffect(() => {
        try {
            const savedSettings = safeLocalStorage.getItem(SETTINGS_KEY);
            if (savedSettings) {
                const parsed = JSON.parse(savedSettings);
                // Merge with defaults to ensure all keys are present after an update
                setSettings(prev => ({ ...prev, ...parsed }));
            }
        } catch (e) {
            console.error("Failed to load settings from localStorage:", e);
            // Stick with defaults if parsing fails
        } finally {
            setIsSettingsLoaded(true);
        }
    }, []);

    // Save settings to localStorage whenever they change
    useEffect(() => {
        if (isSettingsLoaded) {
            try {
                safeLocalStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
            } catch (e) {
                console.error("Failed to save settings to localStorage:", e);
            }
        }
    }, [settings, isSettingsLoaded]);

    return { settings, setSettings, isSettingsLoaded };
};
