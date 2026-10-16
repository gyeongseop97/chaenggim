import { handleWeatherRequest } from './weather-api.mjs';
import { handleNotificationRequest, runNotificationTick } from './weather-notifications.mjs';
import { notificationWeatherForLocation } from './notification-weather.mjs';
import '../weather-advice.js';

const notificationDependencies = () => ({
  weatherForLocation: notificationWeatherForLocation,
  advice: globalThis.ChaenggimAdvice,
});

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/app-config.js') {
      if (!['GET', 'HEAD'].includes(request.method)) {
        return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
      }
      return new Response(request.method === 'HEAD' ? null : 'window.ChaenggimConfig = Object.freeze({ serverApi: true });\n', {
        headers: {
          'content-type': 'text/javascript; charset=utf-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    }
    if (pathname.startsWith('/api/notifications/')) {
      return handleNotificationRequest(request, env, notificationDependencies());
    }
    if (pathname.startsWith('/api/')) return handleWeatherRequest(request, env);
    return env.ASSETS.fetch(request);
  },

  scheduled(_controller, env, context) {
    // This flag keeps the schedule inactive until the operator has finished setup.
    if (env.PUSH_SCHEDULER_READY !== 'true' || !env.WEATHER_DB?.prepare) return;
    const task = runNotificationTick(env, notificationDependencies())
      .then(stats => { console.info('weather-notification-tick', JSON.stringify(stats)); })
      .catch(() => { console.error('weather-notification-tick-failed'); });
    context.waitUntil(task);
  },
};
