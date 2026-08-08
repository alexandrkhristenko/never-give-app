import Panel from '@/components/ui/panel'

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse bg-empty ${className}`} />
}

export default function ProfileLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading profile"
      className="mx-auto flex w-full max-w-[42rem] flex-col gap-6 p-4 sm:p-8"
    >
      <Block className="h-11 w-full" />

      <Panel className="flex flex-col items-center gap-6">
        <Block className="h-6 w-40" />
        <Block className="h-3 w-32" />
        <Block className="h-6 w-3/4" />
        <Block className="h-16 w-14 sm:h-24 sm:w-[5.25rem]" />
        <Block className="h-3 w-48" />
        <div className="grid w-full grid-cols-2 gap-4">
          <Block className="h-16 w-full" />
          <Block className="h-16 w-full" />
        </div>
        <div className="flex w-full flex-col gap-2">
          <Block className="h-4 w-full" />
          <Block className="h-3 w-2/3" />
        </div>
        <Block className="h-3 w-32" />
      </Panel>

      {/* The share bar and the call to action sit outside the panel on the
          real page, and both have visible height. */}
      <Block className="h-11 w-full" />
      <Block className="mx-auto h-11 w-48" />
    </main>
  )
}
