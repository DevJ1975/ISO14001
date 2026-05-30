import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

export interface CurrentWeather {
  tempF: number;
  code: number;
  isDay: boolean;
  windMph: number;
  place: 'site' | 'default';
}

type WeatherStatus = 'idle' | 'loading' | 'ready' | 'error';

// Denver Assembly Plant — matches the demo audit site when geolocation is unavailable.
const DEFAULT_COORDS = { lat: 39.7392, lng: -104.9903 };

@Injectable({ providedIn: 'root' })
export class ConditionsService {
  private readonly destroyRef = inject(DestroyRef);

  readonly now = signal(new Date());
  readonly weather = signal<CurrentWeather | null>(null);
  readonly status = signal<WeatherStatus>('idle');

  readonly time = computed(() =>
    this.now().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  );
  readonly date = computed(() =>
    this.now().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
  );
  readonly conditions = computed(() => describeWeather(this.weather()));

  constructor() {
    if (typeof window === 'undefined') return;
    const tick = window.setInterval(() => this.now.set(new Date()), 1000);
    this.destroyRef.onDestroy(() => window.clearInterval(tick));
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.status.set('loading');
    const coords = await this.resolveCoords();
    try {
      const params = new URLSearchParams({
        latitude: String(coords.lat),
        longitude: String(coords.lng),
        current: 'temperature_2m,weather_code,is_day,wind_speed_10m',
        temperature_unit: 'fahrenheit',
        wind_speed_unit: 'mph',
      });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
      if (!response.ok) throw new Error(`weather ${response.status}`);
      const data = (await response.json()) as {
        current?: { temperature_2m: number; weather_code: number; is_day: number; wind_speed_10m: number };
      };
      if (!data.current) throw new Error('no current weather');
      this.weather.set({
        tempF: Math.round(data.current.temperature_2m),
        code: data.current.weather_code,
        isDay: data.current.is_day === 1,
        windMph: Math.round(data.current.wind_speed_10m),
        place: coords.place,
      });
      this.status.set('ready');
    } catch {
      this.status.set('error');
    }
  }

  private resolveCoords(): Promise<{ lat: number; lng: number; place: CurrentWeather['place'] }> {
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve({ ...DEFAULT_COORDS, place: 'default' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude, place: 'site' }),
        () => resolve({ ...DEFAULT_COORDS, place: 'default' }),
        { timeout: 8000, maximumAge: 600000 },
      );
    });
  }
}

/** Map a WMO weather code to a Material Symbols icon + short label. */
export function describeWeather(weather: CurrentWeather | null): { icon: string; label: string } {
  if (!weather) return { icon: 'cloud', label: '—' };
  const day = weather.isDay;
  const code = weather.code;
  if (code === 0) return { icon: day ? 'clear_day' : 'clear_night', label: 'Clear' };
  if (code <= 2) return { icon: day ? 'partly_cloudy_day' : 'partly_cloudy_night', label: 'Partly cloudy' };
  if (code === 3) return { icon: 'cloud', label: 'Overcast' };
  if (code <= 48) return { icon: 'foggy', label: 'Fog' };
  if (code <= 57) return { icon: 'rainy', label: 'Drizzle' };
  if (code <= 67) return { icon: 'rainy', label: 'Rain' };
  if (code <= 77) return { icon: 'weather_snowy', label: 'Snow' };
  if (code <= 82) return { icon: 'rainy', label: 'Showers' };
  if (code <= 86) return { icon: 'weather_snowy', label: 'Snow showers' };
  return { icon: 'thunderstorm', label: 'Thunderstorm' };
}
