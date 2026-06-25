import './Welcome.css'

// One-time intro shown on first launch. Explains, in plain Hebrew, what the app
// does and — crucially — why it will later ask to use the microphone, so the
// browser's permission prompt never feels surprising or scary.
const STEPS = [
  {
    icon: '🎻',
    title: 'מורה פרטי לקמנצ׳ה',
    text: 'אפליקציה שתלווה אתכם צעד־צעד בלימוד הקמנצ׳ה — בקצב שלכם, בלי צורך במורה לידכם.',
  },
  {
    icon: '🎯',
    title: 'מערך שיעורים מדורג',
    text: 'מתחילים מהמיתרים הפתוחים וממשיכים שלב אחרי שלב. כל שלב נפתח אחרי שהקודם הושלם.',
  },
  {
    icon: '🎤',
    title: 'האפליקציה מקשיבה לכם',
    text: 'כדי לבדוק שאתם מנגנים בקול נקי ומדויק, נבקש רשות להשתמש במיקרופון. ההאזנה לכוונון מתבצעת בזמן אמת במכשיר שלכם — הקול אינו מוקלט ואינו נשלח לשום מקום. (קבצי שמע שתבחרו להעלות לתרגול נשמרים במכשיר, וגם בענן אם הופעלה האפשרות.)',
  },
]

export default function Welcome({ onDone }) {
  return (
    <section className="welcome" dir="rtl" lang="he">
      <div className="welcome__card">
        <ul className="welcome__steps">
          {STEPS.map((s) => (
            <li key={s.title} className="welcome__step">
              <span className="welcome__step-icon" aria-hidden="true">
                {s.icon}
              </span>
              <div className="welcome__step-body">
                <span className="welcome__step-title">{s.title}</span>
                <span className="welcome__step-text">{s.text}</span>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="welcome__button" onClick={onDone}>
          בואו נתחיל
        </button>
      </div>
    </section>
  )
}
