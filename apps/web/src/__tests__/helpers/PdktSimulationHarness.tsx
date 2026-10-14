import { useState, type ComponentProps } from "react";
import PdktSimulation from "../../routes/pdkt/simulation";

type Props = Omit<
  ComponentProps<typeof PdktSimulation>,
  "selectedId" | "onSelectedIdChange" | "canPickParticipant"
> & { canPickParticipant?: boolean };

/** Legacy fixture adapter: production selection is owned by the URL. */
export default function PdktSimulationHarness({
  canPickParticipant = false,
  ...props
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <PdktSimulation
      {...props}
      canPickParticipant={canPickParticipant}
      selectedId={selectedId}
      onSelectedIdChange={async (id) => {
        setSelectedId(id);
      }}
    />
  );
}
