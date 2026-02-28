import { useEffect, useRef, useState } from 'react';

const Turnstile = ({ siteKey, onSuccess, onError, onExpire, theme = 'light' }) => {
  const containerRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [widgetId, setWidgetId] = useState(null);

  useEffect(() => {
    // 加载Turnstile脚本
    const loadScript = () => {
      if (document.querySelector('script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]')) {
        setIsLoaded(true);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        setIsLoaded(true);
      };
      script.onerror = () => {
        console.error('Failed to load Turnstile script');
        onError?.(new Error('Failed to load Turnstile script'));
      };
      document.body.appendChild(script);
    };

    loadScript();

    return () => {
      // 清理组件时移除widget
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || !containerRef.current || !window.turnstile) {
      return;
    }

    // 清理之前的widget
    if (widgetId && window.turnstile) {
      window.turnstile.remove(widgetId);
    }

    // 渲染新的widget
    const newWidgetId = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme: theme,
      callback: (token) => {
        onSuccess?.(token);
      },
      'error-callback': () => {
        onError?.(new Error('Captcha verification failed'));
      },
      'expired-callback': () => {
        onExpire?.();
      },
    });

    setWidgetId(newWidgetId);

    return () => {
      if (newWidgetId && window.turnstile) {
        window.turnstile.remove(newWidgetId);
      }
    };
  }, [isLoaded, siteKey, theme, onSuccess, onError, onExpire]);

  return (
    <div 
      ref={containerRef} 
      className="cf-turnstile"
      data-sitekey={siteKey}
    />
  );
};

export default Turnstile;