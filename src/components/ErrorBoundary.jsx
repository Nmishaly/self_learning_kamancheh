import { Component } from 'react'
import './ErrorBoundary.css'

/**
 * App-wide error boundary. If any view throws while rendering, the student sees
 * a calm Hebrew recovery screen with a single "restart" button instead of a
 * blank white page. (Class component — error boundaries require the lifecycle.)
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    // Surface in the console for debugging; never shown to the user.
    console.error('App crashed:', error, info)
  }

  handleReload = () => {
    // A full reload is the simplest, most reliable recovery for a non-tech user.
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="errboundary" dir="rtl" lang="he">
          <div className="errboundary__icon" aria-hidden="true">
            🎻
          </div>
          <h1 className="errboundary__title">משהו השתבש</h1>
          <p className="errboundary__text">
            אירעה תקלה קטנה. אפשר להתחיל מחדש בלחיצה אחת — ההתקדמות שלכם נשמרה.
          </p>
          <button
            type="button"
            className="errboundary__button"
            onClick={this.handleReload}
          >
            התחלה מחדש
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
