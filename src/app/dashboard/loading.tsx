import Panel from '@/components/ui/panel'

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse bg-empty ${className}`} />
}

export default function DashboardLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading your quest"
      className="mx-auto flex w-full max-w-[42rem] flex-col gap-6 p-4 sm:p-8"
    >
      <Block className="h-11 w-full" />

      {/* One block per element the real page renders, in the same order and
          at the same height. A skeleton that omits the largest block — the
          chain — produces the layout jump it exists to prevent. */}
      <Panel title="ACTIVE QUEST" className="flex flex-col items-center gap-6">
        <Block className="h-6 w-3/4" />
        <Block className="h-16 w-14 sm:h-24 sm:w-[5.25rem]" />
        <Block className="h-3 w-48" />
        <div className="grid w-full grid-cols-2 gap-4">
          <Block className="h-16 w-full" />
          <Block className="h-16 w-full" />
        </div>
        <Block className="h-11 w-full" />
        <div className="flex w-full flex-col gap-2">
          <Block className="h-4 w-full" />
          <Block className="h-3 w-2/3" />
        </div>
        <Block className="h-3 w-32" />
      </Panel>

      {/* The "view public profile" link sits below the panel on the real page. */}
      <Block className="mx-auto h-3 w-40" />
    </main>
  )
}
