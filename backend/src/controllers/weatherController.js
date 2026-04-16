/**
 * weatherController.js — Live weather + AQI for frontend dashboard
 */

import { fetchWeatherForCoords } from '../services/weatherService.js';
import { fetchAqiForCoords }     from '../services/aqiService.js';
import { asyncHandler }          from '../utils/errorHandler.js';

// GET /api/weather/live?lat=xx&lon=yy
export const getLiveWeather = asyncHandler(async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);

  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ success: false, message: 'lat and lon query params are required' });
  }

  const [weatherResult, aqiResult] = await Promise.allSettled([
    fetchWeatherForCoords(lat, lon),
    fetchAqiForCoords(lat, lon),
  ]);

  const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
  const aqi     = aqiResult.status   === 'fulfilled' ? aqiResult.value     : null;

  res.json({
    success: true,
    data: {
      weather: weather ? {
        rainfall_mm:  weather.rainfallMmPerHour,
        temp_c:       weather.heatIndex,
        description:  weather.description,
        city:         weather.cityName,
        source:       weather.source,
      } : null,
      aqi: aqi ? {
        aqi:      aqi.aqi,
        category: aqi.category,
        source:   aqi.source,
      } : null,
    },
  });
});
