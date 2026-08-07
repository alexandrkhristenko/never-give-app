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

      <Panel title="ACTIVE QUEST" className="flex flex-col items-center gap-6">
        <Block className="h-6 w-3/4" />
        <Block className="h-16 w-14 sm:h-24 sm:w-[5.25rem]" />
        <div className="grid w-full grid-cols-2 gap-4">
          <Block className="h-16 w-full" />
          <Block className="h-16 w-full" />
        </div>
        <Block className="h-11 w-full" />
        <Block className="h-4 w-full" />
      </Panel>
    </main>
  )
}
