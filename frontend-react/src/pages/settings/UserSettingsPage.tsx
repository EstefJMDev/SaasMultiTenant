import React, { useEffect, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Select,
  Stack,
  Switch,
  Text,
  useColorMode,
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@widgets/app-shell/AppShell";
import { ProjectHero } from "@widgets/projects/ProjectHero";
import { apiClient } from "@shared/api/client";
import { extractApiError } from "@shared/api/errors";
import type { CurrentUser } from "@api/users";

interface MeResponse extends CurrentUser {
  created_at: string;
}

export const UserSettingsPage: React.FC = () => {
  const toast = useToast();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { colorMode, toggleColorMode } = useColorMode();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState("en");

  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewPasswordConfirm, setShowNewPasswordConfirm] = useState(false);

  const cardBg = useColorModeValue("white", "gray.700");
  const labelColor = useColorModeValue("gray.700", "gray.100");

  const resolvedAvatarUrl = avatarUrl
    ? avatarUrl.startsWith("http") || avatarUrl.startsWith("data:")
      ? avatarUrl
      : `${apiClient.defaults.baseURL || window.location.origin}${avatarUrl}`
    : undefined;

  useEffect(() => {
    const loadMe = async () => {
      try {
        const response = await apiClient.get<MeResponse>("/api/v1/users/me");
        setEmail(response.data.email);
        setFullName(response.data.full_name ?? "");
        setAvatarUrl(
          response.data.avatar_data ?? response.data.avatar_url ?? "",
        );

        const preferredLanguage =
          response.data.language ?? i18n.language ?? "en";
        setLanguage(preferredLanguage);
        void i18n.changeLanguage(preferredLanguage);
      } catch (error: unknown) {
        const detail = extractApiError(error, i18n.t("settings.messages.loadErrorFallback"));
        toast({
          title: i18n.t("settings.messages.loadErrorTitle"),
          description: detail,
          status: "error",
        });
      } finally {
        setLoading(false);
      }
    };

    void loadMe();
  }, [i18n, toast]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await apiClient.patch<MeResponse>("/api/v1/users/me", {
        full_name: fullName,
        language,
      });

      setFullName(response.data.full_name ?? "");
      setEmail(response.data.email);
      setLanguage(response.data.language ?? language);

      queryClient.invalidateQueries({ queryKey: ["current-user"] });

      toast({
        title: t("settings.messages.profileUpdatedTitle"),
        description: t("settings.messages.profileUpdatedDesc"),
        status: "success",
      });
    } catch (error: unknown) {
      const detail = extractApiError(error, t("settings.messages.profileUpdateErrorFallback"));
      toast({
        title: t("settings.messages.profileUpdateErrorTitle"),
        description: detail,
        status: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t("settings.messages.profilePhotoUpdateErrorTitle"),
        description: "La imagen supera el tamano maximo de 5MB.",
        status: "error",
      });
      return;
    }

    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await apiClient.post<MeResponse>(
        "/api/v1/users/me/avatar",
        formData,
      );

      setAvatarUrl(response.data.avatar_data ?? response.data.avatar_url ?? "");
      queryClient.invalidateQueries({ queryKey: ["current-user"] });

      toast({
        title: t("settings.messages.profilePhotoUpdatedTitle"),
        description: t("settings.messages.profilePhotoUpdatedDesc"),
        status: "success",
      });
    } catch (error: unknown) {
      const detail = extractApiError(error, t("settings.messages.profilePhotoUpdateErrorFallback"));
      toast({
        title: t("settings.messages.profilePhotoUpdateErrorTitle"),
        description: detail,
        status: "error",
      });
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !newPasswordConfirm) {
      toast({
        title: t("settings.messages.passwordMissingTitle"),
        description: t("settings.messages.passwordMissingDesc"),
        status: "warning",
      });
      return;
    }

    if (newPassword !== newPasswordConfirm) {
      toast({
        title: t("settings.messages.passwordMismatchTitle"),
        description: t("settings.messages.passwordMismatchDesc"),
        status: "warning",
      });
      return;
    }

    try {
      await apiClient.post("/api/v1/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirm: newPasswordConfirm,
      });

      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");

      toast({
        title: t("settings.messages.passwordUpdatedTitle"),
        description: t("settings.messages.passwordUpdatedDesc"),
        status: "success",
      });
    } catch (error: unknown) {
      const detail = extractApiError(error, t("settings.messages.passwordUpdateErrorFallback"));
      toast({
        title: t("settings.messages.passwordUpdateErrorTitle"),
        description: detail,
        status: "error",
      });
    }
  };

  return (
    <AppShell>
      {/* Header estilo "ProjectHero" sin romper props (usa breadcrumb) */}
      <Box mb={6}>
        <ProjectHero
          items={[]}
          breadcrumb={t("settings.profile")}
          title={t("settings.title")}
          subtitle={t("settings.subtitle")}
        />
      </Box>

      <Stack spacing={8} maxW="640px">
        <Box
          as="form"
          onSubmit={handleSaveProfile}
          borderWidth="1px"
          borderRadius="md"
          p={6}
          bg={cardBg}
        >
          <Heading as="h3" size="sm" mb={4}>
            {t("settings.profile")}
          </Heading>

          <Stack spacing={4}>
            <FormControl>
              <FormLabel color={labelColor}>{t("settings.email")}</FormLabel>
              <Input value={email} isReadOnly />
            </FormControl>

            <FormControl isRequired>
              <FormLabel color={labelColor}>{t("settings.fullName")}</FormLabel>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                isDisabled={loading}
              />
            </FormControl>

            <FormControl>
              <FormLabel color={labelColor}>
                {t("settings.profilePhoto")}
              </FormLabel>
              <Stack
                direction={{ base: "column", sm: "row" }}
                spacing={3}
                align="center"
              >
                <Avatar name={fullName} src={resolvedAvatarUrl} size="md" />
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleAvatarUpload(file);
                  }}
                  isDisabled={loading || avatarUploading}
                />
              </Stack>
              <Text fontSize="xs" color={labelColor} mt={1}>
                {t("settings.profilePhotoHint")}
              </Text>
            </FormControl>

            <FormControl>
              <FormLabel color={labelColor}>{t("settings.language")}</FormLabel>
              <Select
                value={language}
                onChange={(e) => {
                  const nextLanguage = e.target.value;
                  setLanguage(nextLanguage);
                  void i18n.changeLanguage(nextLanguage);
                }}
              >
                <option value="en">{t("settings.languageOptions.en")}</option>
                <option value="es">{t("settings.languageOptions.es")}</option>
              </Select>
              <Text fontSize="xs" color={labelColor} mt={1}>
                {t("settings.languageHelp")}
              </Text>
            </FormControl>

            <FormControl display="flex" alignItems="center">
              <FormLabel mb="0" color={labelColor}>
                {t("settings.darkMode")}
              </FormLabel>
              <Switch
                isChecked={colorMode === "dark"}
                onChange={toggleColorMode}
              />
            </FormControl>

            <Button
              type="submit"
              colorScheme="blue"
              isLoading={saving}
              isDisabled={loading}
              alignSelf="flex-start"
            >
              {t("settings.saveProfile")}
            </Button>
          </Stack>
        </Box>

        <Box borderWidth="1px" borderRadius="md" p={6} bg={cardBg}>
          <Heading as="h3" size="sm" mb={4}>
            {t("settings.password")}
          </Heading>

          <Stack spacing={4}>
            <FormControl isRequired>
              <FormLabel color={labelColor}>
                {t("settings.currentPassword")}
              </FormLabel>
              <InputGroup>
                <Input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
                <InputRightElement>
                  <IconButton
                    aria-label={
                      showCurrentPassword
                        ? "Ocultar contraseña"
                        : "Mostrar contraseña"
                    }
                    variant="ghost"
                    size="sm"
                    icon={showCurrentPassword ? <FiEyeOff /> : <FiEye />}
                    onClick={() => setShowCurrentPassword((prev) => !prev)}
                  />
                </InputRightElement>
              </InputGroup>
            </FormControl>

            <FormControl isRequired>
              <FormLabel color={labelColor}>
                {t("settings.newPassword")}
              </FormLabel>
              <InputGroup>
                <Input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <InputRightElement>
                  <IconButton
                    aria-label={
                      showNewPassword
                        ? "Ocultar contraseña"
                        : "Mostrar contraseña"
                    }
                    variant="ghost"
                    size="sm"
                    icon={showNewPassword ? <FiEyeOff /> : <FiEye />}
                    onClick={() => setShowNewPassword((prev) => !prev)}
                  />
                </InputRightElement>
              </InputGroup>
            </FormControl>

            <FormControl isRequired>
              <FormLabel color={labelColor}>
                {t("settings.confirmPassword")}
              </FormLabel>
              <InputGroup>
                <Input
                  type={showNewPasswordConfirm ? "text" : "password"}
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                />
                <InputRightElement>
                  <IconButton
                    aria-label={
                      showNewPasswordConfirm
                        ? "Ocultar contraseña"
                        : "Mostrar contraseña"
                    }
                    variant="ghost"
                    size="sm"
                    icon={showNewPasswordConfirm ? <FiEyeOff /> : <FiEye />}
                    onClick={() => setShowNewPasswordConfirm((prev) => !prev)}
                  />
                </InputRightElement>
              </InputGroup>
            </FormControl>

            <Button
              type="button"
              colorScheme="blue"
              variant="outline"
              alignSelf="flex-start"
              onClick={() => void handleChangePassword()}
            >
              {t("settings.updatePassword")}
            </Button>
          </Stack>
        </Box>
      </Stack>
    </AppShell>
  );
};

export default UserSettingsPage;
