import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
  Heading,
  Input,
  SimpleGrid,
  Stack,
  Text,
  useToast,
} from "@chakra-ui/react";

import {
  fetchSupplierDataRequest,
  submitSupplierDataRequest,
  type SupplierDataRequestRead,
} from "@api/contracts";
import { apiClient } from "@shared/api/client";
import { getApiErrorDetail } from "@shared/utils/api";

const IS_SUBCONTRATA = (type?: string | null) =>
  (type ?? "").toUpperCase() === "SUBCONTRATACION";

// ── Slots de documentos ────────────────────────────────────────────────────────

interface DocSlot {
  key: string;
  label: string;
}

const DOC_SLOTS_SUB: DocSlot[] = [
  { key: "escritura_poderes", label: "Escritura de poderes" },
  { key: "dni_firmante", label: "DNI persona firmante" },
  { key: "rea_actualizado", label: "REA actualizado" },
  { key: "certificado_hacienda", label: "Certificado negativo de Hacienda" },
  { key: "certificado_ss", label: "Certificado de estar al corriente de pago en la SS" },
];

const DOC_SLOTS_OTHER: DocSlot[] = [
  { key: "escritura_poderes", label: "Escritura de poderes" },
  { key: "dni_firmante", label: "DNI persona firmante/representante" },
];

// ── Token resolution ───────────────────────────────────────────────────────────

const resolveTokenFromPath = (): string => {
  const tokenRegex = /([a-f0-9]{32})/i;
  const extract = (raw: string) => raw.match(tokenRegex)?.[1]?.trim() ?? "";

  const marker = "/supplier/complete/";
  const pathname = window.location.pathname || "";
  const idx = pathname.indexOf(marker);
  if (idx >= 0) {
    const t = extract(pathname.slice(idx + marker.length).trim());
    if (t) return t;
  }
  const hash = window.location.hash || "";
  const hidx = hash.indexOf(marker);
  if (hidx >= 0) {
    const t = extract(hash.slice(hidx + marker.length).split("?")[0].trim());
    if (t) return t;
  }
  const fromSearch = new URLSearchParams(window.location.search).get("token");
  if (fromSearch) {
    const t = extract(fromSearch.trim());
    if (t) return t;
  }
  return "";
};

// ── FileUpload simple ──────────────────────────────────────────────────────────

interface FileUploadFieldProps {
  slot: DocSlot;
  token: string;
  onUploaded: (slot: string) => void;
}

const FileUploadField: React.FC<FileUploadFieldProps> = ({ slot, token, onUploaded }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const toast = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []).slice(0, 2);
    setFiles(selected);
    setDone(false);
  };

  const handleUpload = async () => {
    if (!files.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("doc_slot", slot.key);
      files.forEach((f) => form.append("files", f));
      await apiClient.post(`/public/supplier/complete/${token}/documents`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setDone(true);
      onUploaded(slot.key);
      toast({ status: "success", title: `${slot.label} subido correctamente.`, duration: 3000 });
    } catch (err) {
      toast({
        status: "error",
        title: "Error al subir archivo",
        description: getApiErrorDetail(err, "Inténtalo de nuevo."),
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <FormControl>
      <FormLabel fontSize="sm">{slot.label}</FormLabel>
      <Stack direction="row" align="center" spacing={2}>
        <Input
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          ref={inputRef}
          onChange={handleChange}
          display="none"
        />
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          {files.length ? `${files.length} archivo(s) seleccionado(s)` : "Seleccionar archivos"}
        </Button>
        {files.length > 0 && !done && (
          <Button size="sm" colorScheme="brand" isLoading={uploading} onClick={handleUpload}>
            Subir
          </Button>
        )}
        {done && (
          <Text fontSize="sm" color="green.600" fontWeight="medium">
            Subido
          </Text>
        )}
      </Stack>
      <Text fontSize="xs" color="gray.500" mt={1}>
        Máx. 2 archivos (PDF, JPG, PNG — 10 MB c/u)
      </Text>
    </FormControl>
  );
};

// ── Página principal ───────────────────────────────────────────────────────────

export const SupplierDataCompletePage: React.FC = () => {
  const toast = useToast();
  const token = useMemo(resolveTokenFromPath, []);

  const [requestData, setRequestData] = useState<SupplierDataRequestRead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [isDone, setIsDone] = useState(false);

  // Campos de texto fijos + condicionales
  const [form, setForm] = useState({
    cif_nif: "",
    razon_social: "",
    nombre_firmante: "",
    nif_firmante: "",
    direccion: "",
    // Solo subcontrata
    tipo_escritura: "",
    fecha_escritura: "",
    nombre_notario: "",
    numero_protocolo: "",
  });

  const isSub = IS_SUBCONTRATA(requestData?.contract_type);
  const docSlots = isSub ? DOC_SLOTS_SUB : DOC_SLOTS_OTHER;

  useEffect(() => {
    if (!token) {
      setError("Enlace no válido.");
      setIsLoading(false);
      return;
    }
    fetchSupplierDataRequest(token)
      .then((data) => setRequestData(data))
      .catch((err) => setError(getApiErrorDetail(err, "No se pudo validar el enlace.")))
      .finally(() => setIsLoading(false));
  }, [token]);

  const handleChange = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const requiredBase = ["cif_nif", "razon_social", "nombre_firmante", "nif_firmante", "direccion"] as const;
    const requiredSub = ["tipo_escritura", "fecha_escritura", "nombre_notario", "numero_protocolo"] as const;
    const required: string[] = [...requiredBase, ...(isSub ? requiredSub : [])];

    const firstEmpty = required.find((k) => !(form[k as keyof typeof form] ?? "").trim());
    if (firstEmpty) {
      toast({
        status: "warning",
        title: "Formulario incompleto",
        description: `Completa todos los campos obligatorios.`,
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload: Record<string, string> = {
        cif_nif: form.cif_nif.trim(),
        razon_social: form.razon_social.trim(),
        nombre_firmante: form.nombre_firmante.trim(),
        nif_firmante: form.nif_firmante.trim(),
        direccion: form.direccion.trim(),
        ...(isSub
          ? {
              tipo_escritura: form.tipo_escritura.trim(),
              fecha_escritura: form.fecha_escritura.trim(),
              nombre_notario: form.nombre_notario.trim(),
              numero_protocolo: form.numero_protocolo.trim(),
            }
          : {}),
      };
      await submitSupplierDataRequest(token, payload);
      setIsDone(true);
      toast({ status: "success", title: "Datos enviados", description: "Gracias. Hemos recibido la información." });
    } catch (err) {
      toast({
        status: "error",
        title: "Error al enviar",
        description: getApiErrorDetail(err, "No se pudo guardar la información."),
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Box minH="100vh" display="flex" alignItems="center" justifyContent="center">
        <Text>Validando enlace...</Text>
      </Box>
    );
  }

  if (error || !requestData) {
    return (
      <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" px={6}>
        <Stack spacing={2} textAlign="center" maxW="560px">
          <Text fontWeight="semibold">Enlace no válido o expirado.</Text>
          <Text color="gray.600">{error || "No se pudo cargar la solicitud."}</Text>
        </Stack>
      </Box>
    );
  }

  if (isDone) {
    return (
      <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" px={6}>
        <Stack spacing={2} textAlign="center" maxW="560px">
          <Heading size="md">Información enviada</Heading>
          <Text color="gray.600">Ya hemos recibido los datos. Puedes cerrar esta ventana.</Text>
        </Stack>
      </Box>
    );
  }

  return (
    <Box minH="100vh" bg="gray.50" py={{ base: 8, md: 12 }} px={4}>
      <Box
        maxW="1200px"
        mx="auto"
        bg="white"
        border="1px solid"
        borderColor="gray.200"
        borderRadius="lg"
        p={{ base: 5, md: 8 }}
      >
        <Stack spacing={6}>
          <Heading size="md">Completar datos del proveedor</Heading>
          <Text color="gray.600">
            Para continuar con la formalización del contrato, completa los siguientes campos.
          </Text>

          <form onSubmit={handleSubmit}>
            <Stack spacing={6}>
              {/* Datos de empresa — siempre */}
              <Stack spacing={4}>
                <Text fontWeight="semibold" fontSize="sm" color="gray.500" textTransform="uppercase">
                  Datos de empresa
                </Text>

                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  <FormControl isRequired>
                    <FormLabel>CIF/NIF</FormLabel>
                    <Input
                      value={form.cif_nif}
                      onChange={(e) => handleChange("cif_nif", e.target.value)}
                      placeholder="B12345678"
                    />
                  </FormControl>

                  <FormControl isRequired>
                    <FormLabel>Razón social</FormLabel>
                    <Input
                      value={form.razon_social}
                      onChange={(e) => handleChange("razon_social", e.target.value)}
                    />
                  </FormControl>

                  <FormControl isRequired>
                    <FormLabel>Nombre persona firmante / representante</FormLabel>
                    <Input
                      value={form.nombre_firmante}
                      onChange={(e) => handleChange("nombre_firmante", e.target.value)}
                    />
                  </FormControl>

                  <FormControl isRequired>
                    <FormLabel>NIF persona firmante / representante</FormLabel>
                    <Input
                      value={form.nif_firmante}
                      onChange={(e) => handleChange("nif_firmante", e.target.value)}
                    />
                  </FormControl>
                </SimpleGrid>

                <FormControl isRequired>
                  <FormLabel>Dirección de la empresa</FormLabel>
                  <Input
                    value={form.direccion}
                    onChange={(e) => handleChange("direccion", e.target.value)}
                  />
                </FormControl>

                {/* Solo subcontrata */}
                {isSub && (
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                    <FormControl isRequired>
                      <FormLabel>Tipo de escritura</FormLabel>
                      <Input
                        value={form.tipo_escritura}
                        onChange={(e) => handleChange("tipo_escritura", e.target.value)}
                      />
                    </FormControl>

                    <FormControl isRequired>
                      <FormLabel>Fecha de escritura</FormLabel>
                      <Input
                        type="date"
                        value={form.fecha_escritura}
                        onChange={(e) => handleChange("fecha_escritura", e.target.value)}
                      />
                    </FormControl>

                    <FormControl isRequired>
                      <FormLabel>Nombre del notario</FormLabel>
                      <Input
                        value={form.nombre_notario}
                        onChange={(e) => handleChange("nombre_notario", e.target.value)}
                      />
                    </FormControl>

                    <FormControl isRequired>
                      <FormLabel>Número de protocolo</FormLabel>
                      <Input
                        value={form.numero_protocolo}
                        onChange={(e) => handleChange("numero_protocolo", e.target.value)}
                      />
                    </FormControl>
                  </SimpleGrid>
                )}
              </Stack>

              <Divider />

              {/* Documentación */}
              <Stack spacing={4}>
                <Text fontWeight="semibold" fontSize="sm" color="gray.500" textTransform="uppercase">
                  Documentación a adjuntar
                </Text>
                {docSlots.map((slot) => (
                  <FileUploadField
                    key={slot.key}
                    slot={slot}
                    token={token}
                    onUploaded={() => {}}
                  />
                ))}
              </Stack>

              <Button
                type="submit"
                colorScheme="brand"
                isLoading={isSaving}
                alignSelf="flex-end"
                px={8}
              >
                Enviar información
              </Button>
            </Stack>
          </form>
        </Stack>
      </Box>
    </Box>
  );
};
