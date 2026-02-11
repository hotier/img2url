import { useState, useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { API_URL } from './config';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';

function ApiDocs() {
  const [apiData, setApiData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeLanguage, setActiveLanguage] = useState('curl');
  const [copied, setCopied] = useState('');
  const [expandedResponses, setExpandedResponses] = useState({});
  const exampleCodeRef = useRef(null);
  const [highlightKey, setHighlightKey] = useState(0);

  const languages = [
    { id: 'curl', name: 'cURL', icon: 'bi-terminal', lang: 'bash' },
    { id: 'javascript', name: 'JavaScript', icon: 'bi-braces', lang: 'javascript' },
    { id: 'python', name: 'Python', icon: 'bi-code-slash', lang: 'python' },
    { id: 'php', name: 'PHP', icon: 'bi-file-code', lang: 'php' },
  ];

  useLayoutEffect(() => {
    fetch(`${API_URL}/api`)
      .then(res => res.json())
      .then(data => {
        setApiData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load API docs:', err);
        setLoading(false);
      });
  }, []);

  // 单独处理示例代码的高亮
  useLayoutEffect(() => {
    if (apiData && exampleCodeRef.current) {
      const codeElement = exampleCodeRef.current.querySelector('code');
      if (codeElement) {
        // 移除之前的 class
        codeElement.className = `language-${languages.find(l => l.id === activeLanguage)?.lang || 'bash'}`;
        // 重新应用高亮
        hljs.highlightElement(codeElement);
      }
    }
  }, [apiData, activeLanguage]);

  // 处理响应示例的高亮
  useLayoutEffect(() => {
    if (apiData) {
      document.querySelectorAll('.response-body pre.code-block code').forEach((block) => {
        block.className = 'language-json';
        hljs.highlightElement(block);
      });
    }
  }, [apiData, expandedResponses]);

  const handleCopy = (code, id) => {
    navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  };

  const toggleResponse = (endpointIndex, type, errorIndex = null) => {
    const key = errorIndex !== null 
      ? `${endpointIndex}-error-${errorIndex}`
      : `${endpointIndex}-success`;
    setExpandedResponses(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  if (loading) {
    return (
      <div className="docs-page">
        <div className="docs-loading">
          <div className="spinner"></div>
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (!apiData) {
    return (
      <div className="docs-page">
        <div className="docs-error">
          <i className="bi bi-exclamation-triangle"></i>
          <p>无法加载 API 文档</p>
        </div>
      </div>
    );
  }

  const currentLang = languages.find(l => l.id === activeLanguage);

  return (
    <div className="docs-page">
      <div className="docs-header">
        <Link to="/" className="back-btn">
          <i className="bi bi-arrow-left"></i>
          返回首页
        </Link>
        <div className="docs-brand">
          <h1>
            <i className="bi bi-code-slash"></i>
            API 文档
          </h1>
          <p>{apiData.description}</p>
        </div>
      </div>

      <div className="docs-content">
        <div className="docs-section">
          <h2>基础信息</h2>
          <div className="info-card">
            <div className="info-item">
              <span className="info-label">Base URL</span>
              <code className="info-value">{apiData.baseUrl}</code>
            </div>
            <div className="info-item">
              <span className="info-label">版本</span>
              <span className="info-value">{apiData.version}</span>
            </div>
          </div>
        </div>

        <div className="docs-section">
          <h2>API 端点</h2>
          {apiData.endpoints
            .filter(endpoint => endpoint.path !== '/stats')
            .map((endpoint, index) => (
            <div key={index} className="endpoint-card">
              <div className="endpoint-header">
                <span className={`method-badge ${endpoint.method.toLowerCase()}`}>
                  {endpoint.method}
                </span>
                <code className="endpoint-path">{endpoint.path}</code>
              </div>
              <p className="endpoint-desc">{endpoint.description}</p>

              {endpoint.parameters && endpoint.parameters.length > 0 && (
                <div className="params-section">
                  <h3>参数</h3>
                  <table className="params-table">
                    <thead>
                      <tr>
                        <th>参数名</th>
                        <th>类型</th>
                        <th>必填</th>
                        <th>说明</th>
                      </tr>
                    </thead>
                    <tbody>
                      {endpoint.parameters.map((param, idx) => (
                        <tr key={idx}>
                          <td><code>{param.name}</code></td>
                          <td>{param.type}</td>
                          <td>{param.required ? '是' : '否'}</td>
                          <td>{param.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="response-section">
                <h3>响应示例</h3>
                <div className="response-card success">
                  <div 
                    className="response-header clickable"
                    onClick={() => toggleResponse(index, 'success')}
                  >
                    <i className="bi bi-check-circle"></i>
                    <span>成功响应 ({endpoint.response.success.code})</span>
                    <i className={`bi bi-chevron-${expandedResponses[`${index}-success`] ? 'up' : 'down'}`}></i>
                  </div>
                  {expandedResponses[`${index}-success`] && (
                    <div className="response-body">
                      <pre className="code-block">
                        <code>{JSON.stringify(endpoint.response.success, null, 2)}</code>
                      </pre>
                    </div>
                  )}
                </div>

                {endpoint.response.errors && endpoint.response.errors.map((error, errIdx) => {
                  const key = `${index}-error-${errIdx}`;
                  return (
                    <div className="response-card error" key={errIdx}>
                      <div 
                        className="response-header clickable"
                        onClick={() => toggleResponse(index, 'error', errIdx)}
                      >
                        <i className="bi bi-x-circle"></i>
                        <span>{error.error} ({error.code})</span>
                        <i className={`bi bi-chevron-${expandedResponses[key] ? 'up' : 'down'}`}></i>
                      </div>
                      {expandedResponses[key] && (
                        <div className="response-body">
                          <p className="error-desc">{error.message}</p>
                          <pre className="code-block">
                            <code>{JSON.stringify({
                              success: false,
                              code: error.code,
                              error: error.error,
                              message: error.message
                            }, null, 2)}</code>
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="docs-section">
          <h2>使用示例</h2>
          <div className="example-card">
            <div className="example-tabs">
              {languages.map((lang) => (
                <button
                  key={lang.id}
                  className={`tab-btn ${activeLanguage === lang.id ? 'active' : ''}`}
                  onClick={() => setActiveLanguage(lang.id)}
                >
                  <i className={`bi ${lang.icon}`}></i>
                  {lang.name}
                </button>
              ))}
            </div>
            <div className="example-content" ref={exampleCodeRef}>
              <button
                className="copy-btn"
                onClick={() => handleCopy(apiData.examples[activeLanguage], 'example')}
              >
                <i className={`bi ${copied === 'example' ? 'bi-check' : 'bi-clipboard'}`}></i>
                {copied === 'example' ? '已复制' : '复制'}
              </button>
              <pre className="code-block" key={`${activeLanguage}-${highlightKey}`}>
                <code className={`language-${currentLang?.lang || 'bash'}`}>
                  {apiData.examples[activeLanguage]}
                </code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ApiDocs;