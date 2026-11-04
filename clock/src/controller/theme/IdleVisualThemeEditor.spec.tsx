import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_THEME } from "../../constants";
import type { ThemeConfig } from "../../types";
import IdleVisualThemeEditor from "./IdleVisualThemeEditor";

afterEach(cleanup);

function mountEditor(theme: ThemeConfig = DEFAULT_THEME) {
  const onFieldChange = vi.fn();
  const onFieldsChange = vi.fn();
  const view = render(
    <IdleVisualThemeEditor
      effective={theme}
      onFieldChange={onFieldChange}
      onFieldsChange={onFieldsChange}
    />,
  );
  return {
    ...view,
    onFieldChange,
    onFieldsChange,
    deliverTheme: (effective: ThemeConfig) =>
      view.rerender(
        <IdleVisualThemeEditor
          effective={effective}
          onFieldChange={onFieldChange}
          onFieldsChange={onFieldsChange}
        />,
      ),
  };
}

// jsdom has no pointer capture/layout. Dispatch the actual pointer handlers;
// browser tests retain pointer movement, hit testing and persisted dragging.
function openElement(label: string) {
  const element = screen.getByTitle(
    `${label} — draga til að færa, smella til að breyta lit`,
  );
  Object.defineProperty(element, "setPointerCapture", { value: vi.fn() });
  fireEvent(element, new MouseEvent("pointerdown", { bubbles: true }));
  fireEvent(element, new MouseEvent("pointerup", { bubbles: true }));
}

describe("IdleVisualThemeEditor rendered controls", () => {
  it("explains dragging and clicking alongside the four editable elements", () => {
    mountEditor();
    expect(
      screen.getByText(
        "Dragðu hluti til að færa. Smelltu á hlut til að breyta litum og stærð.",
      ),
    ).toBeVisible();
    for (const [label, text] of [
      ["Merki", "LOGO"],
      ["Klukka", "12:00"],
      ["Hiti", "17°"],
      ["Auglýsing", "AD"],
    ]) {
      const element = screen.getByTitle(
        `${label} — draga til að færa, smella til að breyta lit`,
      );
      expect(within(element).getByText(text)).toBeVisible();
      expect(within(element).getByText(label)).toBeVisible();
    }
  });

  it.each(["Klukka", "Hiti"])(
    "%s opens only color and pixel size controls wired to idle text fields",
    (label) => {
      const { container, onFieldChange, onFieldsChange } = mountEditor({
        ...DEFAULT_THEME,
        idleTextFontSize: "48px",
      });
      openElement(label);
      expect(
        [...container.querySelectorAll(".visual-color-popover-label")].map(
          (node) => node.textContent,
        ),
      ).toEqual(["Litur", "Stærð"]);
      const slider = screen.getByRole("slider");
      expect(slider).toHaveAttribute("min", "10");
      expect(slider).toHaveAttribute("max", "120");
      expect(slider).toHaveAttribute("step", "1");
      expect(slider).toHaveValue("48");
      expect(screen.getByRole("spinbutton")).toHaveValue(48);
      expect(screen.getByText("px")).toBeVisible();
      expect(container.querySelector(".visual-stroke-slider")).toBeNull();
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

      fireEvent.change(slider, { target: { value: "64" } });
      expect(onFieldChange).toHaveBeenLastCalledWith(
        "idleTextFontSize",
        "64px",
      );
      fireEvent.change(screen.getByRole("spinbutton"), {
        target: { value: "72" },
      });
      expect(onFieldChange).toHaveBeenLastCalledWith(
        "idleTextFontSize",
        "72px",
      );
      const swatch = container.querySelector('input[type="color"]');
      expect(swatch).toBeVisible();
      if (!swatch) throw new Error("Missing color input");
      fireEvent.change(swatch, { target: { value: "#123456" } });
      expect(onFieldChange).toHaveBeenLastCalledWith(
        "idleTextColor",
        "#123456",
      );
      expect(onFieldsChange).not.toHaveBeenCalled();
    },
  );

  it.each(["Merki", "Auglýsing"])(
    "%s exposes color without text size, stroke or font family controls",
    (label) => {
      const { container } = mountEditor();
      openElement(label);
      expect(screen.getByText("Litur")).toBeVisible();
      expect(container.querySelector('input[type="color"]')).toBeVisible();
      expect(screen.getByRole("checkbox")).toHaveAttribute(
        "aria-checked",
        "false",
      );
      expect(screen.queryByRole("slider")).not.toBeInTheDocument();
      expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
      expect(screen.queryByText("Stærð")).not.toBeInTheDocument();
    },
  );

  it("toggles transparency and reflects newly delivered theme values", () => {
    const { container, onFieldChange, deliverTheme } = mountEditor();
    openElement("Klukka");
    const toggle = screen.getByRole("checkbox");
    expect(toggle).toBeVisible();
    expect(toggle).toHaveAttribute("title", "Gegnsætt");
    fireEvent.click(toggle);
    expect(onFieldChange).toHaveBeenLastCalledWith(
      "idleTextColor",
      "transparent",
    );
    deliverTheme({ ...DEFAULT_THEME, idleTextColor: "transparent" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTitle("Transparent")).toBeVisible();
    expect(container.querySelector('input[type="color"]')).toBeNull();
    fireEvent.keyDown(toggle, { key: "Enter" });
    expect(onFieldChange).toHaveBeenLastCalledWith("idleTextColor", "#000000");
    deliverTheme({ ...DEFAULT_THEME, idleTextColor: "#000000" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(container.querySelector('input[type="color"]')).toHaveValue(
      "#000000",
    );
  });
});
