import { ChatWidget } from './components/ChatWidget'
import { ScenarioPanel } from './components/ScenarioPanel'
import { WorkflowBoard } from './components/WorkflowBoard'

export default function App() {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#0d0d0d] text-white">
      <div className="flex min-h-0 flex-1">
        <div className="w-[280px] shrink-0">
          <ScenarioPanel />
        </div>
        <WorkflowBoard />
        <div className="w-[320px] shrink-0">
          <ChatWidget />
        </div>
      </div>

      <footer className="shrink-0 border-t border-[#C8FF00]/20 bg-[#C8FF00]/5 px-6 py-3 text-center text-xs text-white/60">
        Demo mode is active — You are viewing simulated KDS + database logic
      </footer>
    </div>
  )
}
