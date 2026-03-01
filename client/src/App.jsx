import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Turnstile from './Turnstile';
import { API_URL, API_DOMAIN } from './config';

// 数字动画组件
function AnimatedNumber({ value, suffix = '' }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 1000; // 动画持续时间 1 秒
    const steps = 60; // 动画步数
    const stepValue = value / steps;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.round(stepValue * currentStep));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  return <span>{displayValue.toLocaleString()}{suffix}</span>;
}

// 存储大小动画组件
function AnimatedSize({ value }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 1000; // 动画持续时间 1 秒
    const steps = 60; // 动画步数
    const stepValue = value / steps;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.round(stepValue * currentStep));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  return <span>{formatSize(displayValue)}</span>;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

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
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const uploadZoneRef = useRef(null);
  const progressBarRef = useRef(null);
  const uploadStatsRef = useRef({
    totalSize: 0,      // 所有文件的总大小
    uploadedSize: 0,   // 已上传的总字节数
    completedFiles: 0  // 已完成的文件数
  }); // 追踪整个上传行为的进度
  const originalQueueRef = useRef([]); // 存储原始队列快照
  const uploadSessionIdRef = useRef(0); // 上传会话ID，用于检测新的上传会话
  const currentBatchTotalRef = useRef(0); // 当前批次的总文件数（固定不变）

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

    fetchStats(false); // 不强制刷新，使用缓存

    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (items) {
        for (let item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              // 将粘贴的图片加入上传队列，保持与其他上传方式一致
              setUploadQueue(prev => [...prev, file]);
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
    const totalFiles = uploadQueue.length;

    // 检测新的上传批次：当前批次完成或原始队列长度不同
    const isNewBatch = uploadStatsRef.current.completedFiles >= currentBatchTotalRef.current ||
                       (currentBatchTotalRef.current > 0 && currentBatchTotalRef.current !== originalQueueRef.current.length);

    if (isNewBatch) {
      // 新的上传批次：生成新的会话ID
      uploadSessionIdRef.current = Date.now();
      // 保存当前批次的总文件数（固定不变）
      currentBatchTotalRef.current = totalFiles;
      // 计算所有文件的总大小
      const totalSize = uploadQueue.reduce((sum, f) => sum + f.size, 0);
      // 保存原始队列快照
      originalQueueRef.current = [...uploadQueue];
      // 重置统计
      uploadStatsRef.current = {
        totalSize: totalSize,
        uploadedSize: 0,
        completedFiles: 0
      };

      // 设置初始进度为1%，确保进度条可见
      setUploadProgress({
        current: 0,
        total: totalFiles,
        currentProgress: 1,
        currentFileName: file.name,
        currentFileSize: file.size
      });
    }

    await handleUpload(file);

    // 更新队列
    setUploadQueue(prev => {
      const newQueue = prev.slice(1);
      
      // 增加已完成文件数
      uploadStatsRef.current.completedFiles = uploadStatsRef.current.completedFiles + 1;

      // 如果队列还有文件，更新当前显示的文件信息
      if (newQueue.length > 0) {
        setUploadProgress(prev => ({
          ...prev,
          current: uploadStatsRef.current.completedFiles,
          currentFileName: newQueue[0].name,
          currentFileSize: newQueue[0].size
        }));
      } else {
        // 所有文件上传完成，更新 current 为总文件数
        setUploadProgress(prev => ({
          ...prev,
          current: uploadStatsRef.current.completedFiles,
          currentProgress: 100
        }));
        // 重置统计
        uploadStatsRef.current = {
          totalSize: 0,
          uploadedSize: 0,
          completedFiles: 0
        };
        // 重置原始队列快照
        originalQueueRef.current = [];
        // 重置当前批次总文件数
        currentBatchTotalRef.current = 0;
      }

      return newQueue;
    });

    // 检查是否所有文件都上传完成
    if (uploadQueue.length === 1) {
      // 所有文件上传完成，先显示 100% 进度
      setUploadProgress(prev => ({
        ...prev,
        currentProgress: 100
      }));
      
      // 延迟 300ms 后显示上传成功动画，让用户看到 100% 进度
      setTimeout(() => {
        setUploadSuccess(true);
        setTimeout(() => {
          setUploading(false);
          setUploadSuccess(false);
          setUploadProgress({ current: 0, total: 0, currentProgress: 0, currentFileName: '', currentFileSize: 0 });
          uploadStatsRef.current = {
            totalSize: 0,
            uploadedSize: 0,
            completedFiles: 0
          };
          // 重置原始队列快照
          originalQueueRef.current = [];
          // 重置当前批次总文件数
          currentBatchTotalRef.current = 0;
        }, 2000); // 2秒后重置
      }, 300); // 300ms 延迟显示成功动画
    }
  };

  // Turnstile验证成功回调
  const handleCaptchaSuccess = (token) => {
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
  };

  // Turnstile验证失败回调
  const handleCaptchaError = (error) => {
    console.log('Captcha error:', error);
    setError('验证失败，请重试');
    setTurnstileToken('');
  };

  // Turnstile验证过期回调
  const handleCaptchaExpire = () => {
    console.log('Captcha expired');
    setError('验证已过期，请重新验证');
    setTurnstileToken('');
  };

  const fetchStats = async (force = false) => {
    try {
      const url = force ? `${API_DOMAIN}/stats?force=true` : `${API_DOMAIN}/stats`;
      const response = await fetch(url);
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

      // 上传进度 - 基于整体上传行为计算进度
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const fileUploadedSize = e.loaded; // 当前文件已上传的字节数
          const fileTotalSize = e.total;     // 当前文件的总字节数

          // 计算已完成文件的总大小（使用原始队列快照）
          const completedFilesTotalSize = originalQueueRef.current.reduce((sum, f, i) => {
            if (i < uploadStatsRef.current.completedFiles) {
              return sum + f.size;
            }
            return sum;
          }, 0);

          // 更新整体已上传字节数：已完成文件的总大小 + 当前文件已上传的字节数
          uploadStatsRef.current.uploadedSize = completedFilesTotalSize + fileUploadedSize;

          // 计算整体上传行为进度：已上传总字节数 / 所有文件总字节数
          // 使用 Math.min 限制最大值为 100，避免显示 101%
          const overallProgress = Math.min(
            100,
            Math.round((uploadStatsRef.current.uploadedSize / uploadStatsRef.current.totalSize) * 100)
          );

          setUploadProgress(prev => ({
            ...prev,
            currentProgress: overallProgress,
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

              // 更新已完成文件数和已上传字节数
              uploadStatsRef.current.completedFiles = uploadStatsRef.current.completedFiles + 1;
              // 计算已完成文件的总大小（用于下一个文件的进度计算）
              const completedFilesTotalSize = originalQueueRef.current.reduce((sum, f, i) => {
                if (i < uploadStatsRef.current.completedFiles) {
                  return sum + f.size;
                }
                return sum;
              }, 0);
              uploadStatsRef.current.uploadedSize = completedFilesTotalSize;

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
          // 使用 Math.min 限制最大值为 100，避免显示 101%
          const progress = Math.min(100, Math.round((e.loaded / e.total) * 100));
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
          className={`upload-zone ${dragActive ? 'active' : ''} ${uploading ? 'uploading' : ''} ${uploadSuccess ? 'uploaded' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          ref={uploadZoneRef}
        >
          <input
            type="file"
            id="file-upload"
            className="d-none"
            accept="image/*"
            multiple
            onChange={handleChange}
            disabled={uploading || uploadSuccess}
          />
          <label htmlFor="file-upload" className="upload-label">
            {uploadSuccess ? (
              <div className="upload-success">
                <div className="success-icon">
                  <div className="success-check">
                    <svg viewBox="0 0 40 40">
                      <path d="M10 20 L17 27 L30 13" />
                    </svg>
                  </div>
                </div>
                <span className="success-text">上传成功！</span>
              </div>
            ) : uploading ? (
              <div className="upload-state uploading">
                <div className="progress-bar-container" ref={progressBarRef} key="progress-bar">
                  {/* 桌面端：移动的气泡 */}
                  <div className="progress-bubble" style={{ left: `${uploadProgress.currentProgress}%` }}>
                    <span>{uploadProgress.currentProgress}%</span>
                  </div>
                  {/* 进度条 */}
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${uploadProgress.currentProgress}%` }}></div>
                    {/* 移动端：固定在中间的文字 */}
                    <div className="progress-text-mobile">{uploadProgress.currentProgress}%</div>
                  </div>
                </div>
                {uploadProgress.total > 0 && (
                  <span className="upload-queue-info">({uploadProgress.current}/{uploadProgress.total})</span>
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
                  <Turnstile
                    siteKey="0x4AAAAAACasWM4vLebpu_B7"
                    onSuccess={handleCaptchaSuccess}
                    onError={handleCaptchaError}
                    onExpire={handleCaptchaExpire}
                    theme="light"
                  />
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
            <div className="setting-left">
              <label className="toggle-wrapper">
                <input
                  type="checkbox"
                  checked={showExpirationOptions}
                  onChange={handleToggleExpiration}
                  className="d-none"
                />
                <span className="toggle"></span>
              </label>
              <span className="setting-label">图片有效期</span>
              <div className="setting-tooltip">
                <i className="bi bi-question-circle"></i>
                <span className="tooltip">不开启默认永久保存</span>
              </div>
            </div>
            {showExpirationOptions && (
              <div className={`expiration-bar show`}>
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
            )}
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
                  <button className="history-delete" onClick={() => deleteImage(index)} title="删除">
                    <i className="bi bi-trash"></i>
                  </button>
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
                      <div className="history-actions-group">
                        <button onClick={() => copyToClipboard(img.url)} title="复制">
                          <i className="bi bi-clipboard"></i>
                        </button>
                        <a href={img.url} target="_blank" rel="noopener noreferrer" title="打开">
                          <i className="bi bi-box-arrow-up-right"></i>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 底部状态栏 */}
      <div className="status-bar">
        <div className="status-badges">
          <span className="status-badge">
            <i className="bi bi-images"></i>
            <AnimatedNumber value={stats?.images || 0} suffix=" 张" />
          </span>
          <span className="status-badge">
            <i className="bi bi-hdd"></i>
            <AnimatedSize value={stats?.totalSize || 0} />
          </span>
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