import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TelefunIdentityTab } from "../routes/telefun/components/settings/TelefunIdentityTab";
import {
  DEFAULT_TELEFUN_SETTINGS,
  type TelefunAppSettings,
} from "../routes/telefun/telefunSettings";

interface OpenAiIdentityHarnessProps {
  initialGender?: "random" | "male" | "female";
  initialVoice?: string;
}

function OpenAiIdentityHarness({
  initialGender = "random",
  initialVoice = "",
}: OpenAiIdentityHarnessProps) {
  const [settings, setSettings] = useState<TelefunAppSettings>({
    ...DEFAULT_TELEFUN_SETTINGS,
    identitySettings: {
      ...DEFAULT_TELEFUN_SETTINGS.identitySettings,
      gender: initialGender,
      voiceName: initialVoice,
    },
  });

  return (
    <>
      <TelefunIdentityTab
        identitySettings={settings.identitySettings}
        telefunModelId="gpt-realtime-2.1"
        setLocalSettings={setSettings}
      />
      <output data-testid="voice-value">
        {settings.identitySettings.voiceName}
      </output>
    </>
  );
}

describe("TelefunIdentityTab provider-aware voices", () => {
  it("disables OpenAI voice selection for a random persona gender", () => {
    const { container } = render(<OpenAiIdentityHarness />);
    const voiceSelect = container.querySelectorAll("select")[1];

    expect(voiceSelect).toBeDisabled();
    expect(
      Array.from(voiceSelect.options).map((option) => option.value),
    ).toEqual([""]);
    expect(voiceSelect.options[0].textContent).toBe("Acak (Sesuai Gender)");
  });

  it("shows only male OpenAI voices for a male persona", () => {
    const { container } = render(
      <OpenAiIdentityHarness initialGender="male" />,
    );
    const voiceSelect = container.querySelectorAll("select")[1];

    expect(voiceSelect).not.toBeDisabled();
    expect(
      Array.from(voiceSelect.options).map((option) => option.value),
    ).toEqual(["", "ash", "ballad", "echo", "verse", "cedar"]);
  });

  it("shows only female OpenAI voices for a female persona", () => {
    const { container } = render(
      <OpenAiIdentityHarness initialGender="female" initialVoice="marin" />,
    );
    const voiceSelect = container.querySelectorAll("select")[1];

    expect(voiceSelect).not.toBeDisabled();
    expect(
      Array.from(voiceSelect.options).map((option) => option.value),
    ).toEqual([
      "",
      "coral",
      "sage",
      "shimmer",
      "marin",
    ]);
  });

  it("clears an OpenAI voice when persona gender changes", () => {
    const { container } = render(
      <OpenAiIdentityHarness initialGender="female" initialVoice="marin" />,
    );
    const [genderSelect] = container.querySelectorAll("select");

    fireEvent.change(genderSelect, { target: { value: "male" } });

    expect(screen.getByTestId("voice-value")).toBeEmptyDOMElement();
  });
});
