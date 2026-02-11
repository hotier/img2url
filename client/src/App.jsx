import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { API_URL, API_DOMAIN } from './config';

function App() {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [error, setError] = useState('');
  const [expiration, setExpiration] = useState(0);
  const [showExpirationOptions, setShowExpirationOptions] = useState(false);
  const [stats, setStats] = useState(null);
  const [uploadCount, setUploadCount] = useState(0);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, currentProgress: 0, currentFileName: '', currentFileSize: 0 });
  const uploadZoneRef = useRef(null);

  useEffect(() => {
    const savedImages = localStorage.getItem('uploadedImages');
    if (savedImages) {
      setUploadedImages(JSON.parse(savedImages));
    }

    const savedExpiration = localStorage.getItem('expiration');
    if (savedExpiration) {
      setExpiration(parseInt(savedExpiration));
    }

    const savedUploadCount = localStorage.getItem('uploadCount');
    if (savedUploadCount) {
      setUploadCount(parseInt(savedUploadCount));
    }

    fetchStats();

    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (items) {
        for (let item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              handleUpload(file);
              break;
            }
          }
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  // 处理上传队列（支持并发）
  useEffect(() => {
    if (uploadQueue.length > 0 && !uploading) {
      processUploadQueue();
    }
  }, [uploadQueue, uploading]);

  const processUploadQueue = async () => {
    if (uploadQueue.length === 0 || uploading) return;

    setUploading(true);
    const file = uploadQueue[0];
    setUploadProgress({ current: 1, total: uploadQueue.length });

    await handleUpload(file);

    setUploadQueue(prev => prev.slice(1));
    setUploadProgress({ current: uploadQueue.length - 1, total: uploadQueue.length - 1 });

    if (uploadQueue.length === 1) {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0, currentProgress: 0, currentFileName: '', currentFileSize: 0 });
    }
  };

  // 手动渲染 Turnstile
  useEffect(() => {
    if (captchaRequired && window.turnstile) {
      const container = document.getElementById('turnstile-container');
      if (container) {
        console.log('Manually rendering Turnstile');
        try {
          // 清空容器内容，确保干净的状态
          container.innerHTML = '';

          const widgetId = window.turnstile.render('#turnstile-container', {
            sitekey: '0x4AAAAAACasWM4vLebpu_B7',
            theme: 'light',
            callback: (token) => {
              console.log('Captcha success:', token);
              setTurnstileToken(token);
              setTimeout(() => {
                setCaptchaRequired(false);
                setError('');
                // 如果有待上传的文件，自动上传
                if (pendingFile) {
                  handleUploadWithToken(pendingFile, token);
                  setPendingFile(null); // 清除缓存的文件
                }
              }, 500);
            },
            'error-callback': () => {
              console.log('Captcha error');
              setError('验证失败，请重试');
              setTurnstileToken('');
            },
            'expired-callback': () => {
              console.log('Captcha expired');
              setError('验证已过期，请重新验证');
              setTurnstileToken('');
            },
          });

          // 保存 widgetId 以便后续清理
          container.dataset.widgetId = widgetId;
        } catch (e) {
          console.error('Failed to render Turnstile:', e);
        }
      }
    }
  }, [captchaRequired]); // 只依赖 captchaRequired

  // 加载 Turnstile 脚本
  useEffect(() => {
    if (document.querySelector('script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]')) {
      console.log('Turnstile script already loaded');
      return; // 已经加载过了
    }

    console.log('Loading Turnstile script...');
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      console.log('Turnstile script loaded successfully');
      if (window.turnstile) {
        console.log('Turnstile API available:', window.turnstile);
      }
    };
    script.onerror = () => {
      console.error('Failed to load Turnstile script');
    };
    document.body.appendChild(script);
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_DOMAIN}/stats`);
      const result = await response.json();
      if (result.success) {
        setStats(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  useEffect(() => {
    localStorage.setItem('uploadedImages', JSON.stringify(uploadedImages));
  }, [uploadedImages]);

  useEffect(() => {
    localStorage.setItem('expiration', expiration.toString());
  }, [expiration]);

  useEffect(() => {
    localStorage.setItem('uploadCount', uploadCount.toString());
  }, [uploadCount]);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      setUploadQueue(prev => [...prev, ...files]);
    }
  };

  const handleChange = async (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      setUploadQueue(prev => [...prev, ...files]);
    }
  };

  const handleUpload = async (file) => {
    if (!file.type.startsWith('image/')) {
      setError('只支持图片文件');
      return;
    }

    // 检查是否需要验证码（300次后每50次验证一次）
    if (uploadCount >= 300 && (uploadCount % 50) === 0) {
      if (!turnstileToken) {
        console.log('Captcha required - uploadCount:', uploadCount, 'turnstileToken:', turnstileToken);
        // 缓存待上传的文件
        setPendingFile(file);
        setCaptchaRequired(true);
        setError('请先完成人机验证');
        return;
      }
      console.log('Has captcha token, proceeding with upload');
    }

    setError('');
    setUploading(true);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);
      if (expiration > 0) {
        formData.append('expiration', expiration.toString());
      }
      if (turnstileToken) {
        formData.append('turnstile', turnstileToken);
      }

      // 上传进度
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(prev => ({
            ...prev,
            currentProgress: progress,
            currentFileName: file.name,
            currentFileSize: file.size
          }));
          // 动态更新波浪高度
          if (uploadZoneRef.current) {
            const waveElement = uploadZoneRef.current.querySelector('::before');
            if (waveElement) {
              waveElement.style.height = `${progress}%`;
            }
          }
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          try {
            const result = JSON.parse(xhr.responseText);

            if (result.success) {
              const imageInfo = {
                url: result.data.url,
                fileName: result.data.fileName,
                originalName: file.name,
                size: result.data.size,
                type: result.data.type,
                expiration: result.data.expiration,
                expirationDays: result.data.expirationDays || null,
                timestamp: result.data.timestamp,
                uploadTime: new Date().toISOString(),
                duplicate: result.data.duplicate || false,
                uploadCount: result.data.uploadCount || 1,
              };
              setUploadedImages([imageInfo, ...uploadedImages]);

              // 如果是重复上传，不增加计数
              if (!result.data.duplicate) {
                const newUploadCount = uploadCount + 1;
                setUploadCount(newUploadCount);

                // 清除验证 token（防止重复使用）
                setTurnstileToken('');
              }

              fetchStats();
              resolve(result);
            } else {
              console.error('Upload failed:', result);
              setError(result.message || '上传失败');

              // 如果需要验证码，显示验证组件
              if (result.error === 'CAPTCHA_REQUIRED') {
                setCaptchaRequired(true);
              }

              // 如果验证码已使用，需要重新验证
              if (result.error === 'CAPTCHA_USED') {
                setTurnstileToken('');
                setCaptchaRequired(true);
                setError('验证码已使用，请重新验证');
              }
              reject(result);
            }
          } catch (err) {
            console.error('Parse error:', err);
            setError('服务器响应错误');
            reject(err);
          }
        } else {
          setError(`上传失败 (${xhr.status})`);
          reject(new Error(`HTTP ${xhr.status}`));
        }
        setUploading(false);
      });

      xhr.addEventListener('error', () => {
        console.error('Upload error');
        setError('网络错误，请重试');
        setUploading(false);
        reject(new Error('Network error'));
      });

      xhr.addEventListener('abort', () => {
        setUploading(false);
        reject(new Error('Upload aborted'));
      });

      xhr.open('POST', `${API_DOMAIN}/upload`);
      xhr.send(formData);
    });
  };

  // 辅助函数：使用指定的验证token上传文件
  const handleUploadWithToken = async (file, token) => {
    setError('');
    setUploading(true);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);
      if (expiration > 0) {
        formData.append('expiration', expiration.toString());
      }
      formData.append('turnstile', token);

      // 上传进度
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(prev => ({
            ...prev,
            currentProgress: progress,
            currentFileName: file.name,
            currentFileSize: file.size
          }));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          try {
            const result = JSON.parse(xhr.responseText);

            if (result.success) {
              const imageInfo = {
                url: result.data.url,
                fileName: result.data.fileName,
                originalName: file.name,
                size: result.data.size,
                type: result.data.type,
                expiration: result.data.expiration,
                expirationDays: result.data.expirationDays || null,
                timestamp: result.data.timestamp,
                uploadTime: new Date().toISOString(),
                duplicate: result.data.duplicate || false,
                uploadCount: result.data.uploadCount || 1,
              };
              setUploadedImages([imageInfo, ...uploadedImages]);

              // 如果是重复上传，不增加计数
              if (!result.data.duplicate) {
                const newUploadCount = uploadCount + 1;
                setUploadCount(newUploadCount);

                // 清除验证 token（防止重复使用）
                setTurnstileToken('');
              }

              fetchStats();
              resolve(result);
            } else {
              setError(result.message || '上传失败');

              // 如果需要验证码，显示验证组件
              if (result.error === 'CAPTCHA_REQUIRED') {
                setCaptchaRequired(true);
              }

              // 如果验证码已使用，需要重新验证
              if (result.error === 'CAPTCHA_USED') {
                setTurnstileToken('');
                setCaptchaRequired(true);
                setError('验证码已使用，请重新验证');
              }
              reject(result);
            }
          } catch (err) {
            setError('服务器响应错误');
            reject(err);
          }
        } else {
          setError(`上传失败 (${xhr.status})`);
          reject(new Error(`HTTP ${xhr.status}`));
        }
        setUploading(false);
      });

      xhr.addEventListener('error', () => {
        setError('网络错误，请重试');
        setUploading(false);
        reject(new Error('Network error'));
      });

      xhr.open('POST', `${API_DOMAIN}/upload`);
      xhr.send(formData);
    });
  };

  const copyToClipboard = (url) => {
    navigator.clipboard.writeText(url);
    const toast = document.createElement('div');
    toast.className = 'copy-toast';
    toast.textContent = '✓ 已复制';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1500);
  };

  const deleteImage = (index) => {
    setUploadedImages(uploadedImages.filter((_, i) => i !== index));
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getExpirationText = (expirationDays) => {
    if (expirationDays === null || expirationDays === 0 || expirationDays === undefined) return '永久';
    return `${expirationDays}天`;
  };

  const handleToggleExpiration = () => {
    setShowExpirationOptions(!showExpirationOptions);
    // 关闭时重置为永久
    if (showExpirationOptions) {
      setExpiration(0);
    }
  };

  return (
    <div className="app-container">
      <div className="main-card">
        {/* 顶部栏 */}
        <div className="card-header">
          <div className="brand-section">
            <h1>
              <i className="bi bi-cloud-upload"></i>
              Img2URL
            </h1>
            <p>免费图片托管 · 基于 Cloudflare R2</p>
          </div>
          <div className="header-actions">
            <Link to="/api" className="btn-secondary">
              <i className="bi bi-code-slash"></i>
              API文档
            </Link>
          </div>
        </div>

        {/* 上传区域 */}
        <div
          className={`upload-zone ${dragActive ? 'active' : ''} ${uploading ? 'uploading' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          ref={uploadZoneRef}
        >
          {uploading && (
            <>
              <div
                className="wave-background"
                style={{ width: `${uploadProgress.currentProgress}%` }}
              >
                <div className="wave-lines"></div>
                <div className="wave-surface"></div>
              </div>
            </>
          )}
          <input
            type="file"
            id="file-upload"
            className="d-none"
            accept="image/*"
            multiple
            onChange={handleChange}
            disabled={uploading}
          />
          <label htmlFor="file-upload" className="upload-label">
            {uploading ? (
              <div className="upload-state uploading">
                {uploadProgress.currentProgress > 0 ? (
                  <>
                    <div className="upload-progress-container">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${uploadProgress.currentProgress}%` }}></div>
                      </div>
                      <span className="progress-text">{uploadProgress.currentProgress}%</span>
                    </div>
                    {uploadProgress.currentFileName && (
                      <span className="upload-filename">{uploadProgress.currentFileName}</span>
                    )}
                    {uploadProgress.total > 0 && (
                      <span className="upload-queue-info">({uploadProgress.current}/{uploadProgress.total})</span>
                    )}
                  </>
                ) : (
                  <>
                    <div className="spinner"></div>
                    {uploadProgress.total > 0 ? (
                      <span>准备上传 ({uploadProgress.current}/{uploadProgress.total})...</span>
                    ) : (
                      <span>上传中...</span>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="upload-state idle">
                <div className="upload-icon">
                  <i className="bi bi-cloud-arrow-up"></i>
                </div>
                <h3>拖拽或点击上传</h3>
                <p>支持拖拽 · 点击选择 · Ctrl+V 粘贴</p>
              </div>
            )}
          </label>
        </div>

        {/* Turnstile 人机验证弹窗 */}
        {captchaRequired && (
          <div className="captcha-modal-overlay fade-in">
            <div className="captcha-modal">
              <div className="captcha-modal-header">
                <h3>
                  <i className="bi bi-shield-check"></i>
                  人机验证
                </h3>
                <button
                  className="captcha-close-btn"
                  onClick={() => {
                    setTurnstileToken('');
                    setCaptchaRequired(false);
                    setError('请先完成人机验证');
                  }}
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
              <div className="captcha-modal-body">
                <p>为了防止滥用，请完成以下验证：</p>
                <div className="captcha-wrapper">
                  <div
                    id="turnstile-container"
                    className="cf-turnstile"
                    data-sitekey="0x4AAAAAACasWM4vLebpu_B7"
                  ></div>
                </div>
              </div>
              <div className="captcha-modal-footer">
                <p className="captcha-hint">
                  <i className="bi bi-info-circle"></i>
                  验证完成后即可继续上传
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 控制栏 */}
        <div className="control-bar">
          <div className="setting-row">
            <label className="toggle-wrapper">
              <input
                type="checkbox"
                checked={showExpirationOptions}
                onChange={handleToggleExpiration}
                className="d-none"
              />
              <span className="toggle"></span>
              <span className="setting-label">图片有效期</span>
            </label>
            <div className="setting-tooltip">
              <i className="bi bi-question-circle"></i>
              <span className="tooltip">不开启默认永久保存</span>
            </div>
            <div className={`expiration-bar ${showExpirationOptions ? 'show' : ''}`}>
              {[1, 7, 30, 90].map((days) => (
                <button
                  key={days}
                  className={`day-btn ${expiration === days ? 'active' : ''}`}
                  onClick={() => setExpiration(days)}
                >
                  {days === 1 ? '1天' : `${days}天`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="error-message fade-in">
            <i className="bi bi-exclamation-triangle"></i>
            {error}
          </div>
        )}

        {/* 上传历史 */}
        {uploadedImages.length > 0 && (
          <div className="history-section">
            <div className="section-header">
              <h4>
                <i className="bi bi-clock-history"></i>
                上传历史
                <span className="history-count">{uploadedImages.length}</span>
              </h4>
              <button className="clear-btn" onClick={() => setUploadedImages([])}>
                清除历史
              </button>
            </div>
            <div className="history-list">
              {uploadedImages.map((img, index) => (
                <div key={index} className={`history-item ${img.duplicate ? 'duplicate' : ''}`}>
                  <img src={img.url} alt="" className="history-thumb" />
                  <div className="history-info">
                    <div className="history-name">{img.originalName}</div>
                    <div className="history-meta">
                      <span>{formatSize(img.size)}</span>
                      <span className="meta-badge">{getExpirationText(img.expirationDays)}</span>
                      {img.duplicate && <span className="meta-badge duplicate-badge">重复</span>}
                      {img.uploadCount > 1 && <span className="meta-badge count-badge">{img.uploadCount}次</span>}
                    </div>
                    <div className="history-url">
                      <input type="text" value={img.url} readOnly />
                      <button onClick={() => copyToClipboard(img.url)} title="复制">
                        <i className="bi bi-clipboard"></i>
                      </button>
                      <a href={img.url} target="_blank" rel="noopener noreferrer" title="打开">
                        <i className="bi bi-box-arrow-up-right"></i>
                      </a>
                    </div>
                  </div>
                  <button className="history-delete" onClick={() => deleteImage(index)} title="删除">
                    <i className="bi bi-trash"></i>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 底部状态栏 */}
      <div className="status-bar">
        <div className="status-badges">
          {stats && (
            <>
              <span className="status-badge">
                <i className="bi bi-images"></i>
                {stats.images.toLocaleString()} 张
              </span>
              <span className="status-badge">
                <i className="bi bi-hdd"></i>
                {stats.totalSizeFormatted}
              </span>
            </>
          )}
          <span className="status-badge">
            <i className="bi bi-shield-check"></i>
            Cloudflare R2
          </span>
        </div>
      </div>
    </div>
  );
}

export default App;