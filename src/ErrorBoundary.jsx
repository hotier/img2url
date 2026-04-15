import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    // 重新加载页面
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <div className="error-icon">
              <i className="bi bi-exclamation-triangle-fill"></i>
            </div>
            <h2>出错了</h2>
            <p>抱歉，应用遇到了一些问题。请尝试刷新页面。</p>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="error-details">
                <details>
                  <summary>查看错误详情（仅开发模式）</summary>
                  <pre className="error-stack">
                    {this.state.error.toString()}
                    {this.state.errorInfo && this.state.errorInfo.componentStack}
                  </pre>
                </details>
              </div>
            )}
            
            <button 
              className="error-reset-btn" 
              onClick={this.handleReset}
            >
              <i className="bi bi-arrow-clockwise"></i>
              刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;