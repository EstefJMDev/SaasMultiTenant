import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { login } from "@api/auth";
import { LoginPage } from "@pages/auth";
import { renderWithProviders } from "./testUtils";

vi.mock("@api/auth", () => ({
  login: vi.fn(),
}));

const pushMock = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    history: {
      push: pushMock,
    },
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const mockedLogin = vi.mocked(login);

describe("LoginPage", () => {
  beforeEach(() => {
    pushMock.mockReset();
    mockedLogin.mockReset();
    localStorage.clear();
  });

  it("redirige a /mfa cuando el backend requiere MFA", async () => {
    mockedLogin.mockResolvedValueOnce({
      mfa_required: true,
      access_token: undefined,
      token_type: undefined,
    });

    renderWithProviders(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/auth\.login\.email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/auth\.login\.password/i), {
      target: { value: "password" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /auth\.login\.submit/i }),
    );

    await waitFor(() => {
      expect(mockedLogin).toHaveBeenCalled();
      expect(pushMock).toHaveBeenCalledWith("/mfa");
    });
  });

  it("guarda el token y redirige al dashboard cuando el login es directo", async () => {
    mockedLogin.mockResolvedValueOnce({
      mfa_required: false,
      access_token: "test-token",
      token_type: "bearer",
    });

    renderWithProviders(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/auth\.login\.email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/auth\.login\.password/i), {
      target: { value: "password" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /auth\.login\.submit/i }),
    );

    await waitFor(() => {
      expect(mockedLogin).toHaveBeenCalled();
      expect(pushMock).toHaveBeenCalledWith("/dashboard");
    });
  });
});
