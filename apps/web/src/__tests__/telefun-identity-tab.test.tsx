import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TelefunIdentityTab } from "../routes/telefun/components/settings/TelefunIdentityTab";
import {
  DEFAULT_TELEFUN_SETTINGS,
  type TelefunAppSettings,
} from "../routes/telefun/telefunSettings";
import { GEMINI_LIVE_VOICES_BY_GENDER } from "@trainers/types";

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
  it("disables voice selection for a random persona gender", () => {
    const { container } = render(<OpenAiIdentityHarness />);
    const voiceSelect = container.querySelectorAll("select")[1];

    expect(voiceSelect).toBeDisabled();
    expect(
      Array.from(voiceSelect.options).map((option) => option.value),
    ).toEqual([""]);
    expect(voiceSelect.options[0].textContent).toBe("Acak (Sesuai Gender)");
  });

  it("shows only male Gemini Live voices for a male persona", () => {
    const { container } = render(
      <OpenAiIdentityHarness initialGender="male" />,
    );
    const voiceSelect = container.querySelectorAll("select")[1];

    expect(voiceSelect).not.toBeDisabled();
    expect(
      Array.from(voiceSelect.options).map((option) => option.value),
    ).toEqual(["", ...GEMINI_LIVE_VOICES_BY_GENDER.male]);
  });

  it("shows only female Gemini Live voices for a female persona", () => {
    const femaleVoice = GEMINI_LIVE_VOICES_BY_GENDER.female[0];
    const { container } = render(
      <OpenAiIdentityHarness
        initialGender="female"
        initialVoice={femaleVoice}
      />,
    );
    const voiceSelect = container.querySelectorAll("select")[1];

    expect(voiceSelect).not.toBeDisabled();
    expect(Array.from(voiceSelect.options).map((option) => option.value)).toEqual([
      "",
      ...GEMINI_LIVE_VOICES_BY_GENDER.female,
    ]);
  });

  it("clears the selected voice when persona gender changes", () => {
    const { container } = render(
      <OpenAiIdentityHarness
        initialGender="female"
        initialVoice={GEMINI_LIVE_VOICES_BY_GENDER.female[0]}
      />,
    );
    const [genderSelect] = container.querySelectorAll("select");

    fireEvent.change(genderSelect, { target: { value: "male" } });

    expect(screen.getByTestId("voice-value")).toBeEmptyDOMElement();
  });
});
