import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Heading,
  Icon,
  IconButton,
  Input,
  SimpleGrid,
  Stack,
  Tag,
  TagLabel,
  Text,
  useToast,
} from "@chakra-ui/react";
import { useRouter } from "@tanstack/react-router";
import { Paperclip, Upload, X } from "lucide-react";
import { getApiErrorDetail } from "@shared/utils/api";

import {
  completeSupplierOnboarding,
  validateSupplierOnboarding,
  type Supplier,
  type SupplierOnboardingValidateResponse,
} from "@api/contracts";

const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "docx", "xlsx"];
const ALLOWED_ACCEPT = ".pdf,.jpg,.jpeg,.png,.docx,.xlsx";
const MAX_FILES_PER_CATEGORY = 2;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface DocCategory {
  key: "escritura_poderes" | "dni_firmante" | "rea" | "cert_hacienda" | "cert_ss";
  label: string;
}

const DOC_CATEGORIES_BASE: DocCategory[] = [
  { key: "escritura_poderes", label: "Escritura de poderes" },
  { key: "dni_firmante", label: "DNI persona firmante/representante" },
];

const DOC_CATEGORIES_SUB: DocCategory[] = [
  { key: "escritura_poderes", label: "Escritura de poderes" },
  { key: "dni_firmante", label: "DNI persona firmante" },
  { key: "rea", label: "REA actualizado" },
  { key: "cert_hacienda", label: "Certificado negativo de Hacienda" },
  { key: "cert_ss", label: "Certificado de estar al corriente de pago en la Seguridad Social" },
];

interface SupplierFormState {
  razon_social: string;
  cif: string;
  nombre_gerente: string;
  nif_gerente: string;
  direccion_empresa: string;
  tipo_escritura: string;
  fecha_escritura: string;
  nombre_notario: string;
  num_protocolo: string;
}

const fixMojibake = (value?: string | null): string => {
  if (!value) return "";
  try {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return decodeURIComponent(escape(value));
  } catch {
    return value.replace(/�/g, "");
  }
};

const buildFormState = (
  validation?: SupplierOnboardingValidateResponse,
  supplier?: Supplier,
): SupplierFormState => ({
  razon_social: fixMojibake(
    (validation?.prefill?.razon_social as string | null) ?? supplier?.name ?? "",
  ),
  cif:
    (validation?.prefill?.cif as string | null) ?? supplier?.tax_id ?? "",
  // El proveedor introduce su firmante; no prellenar con el usuario creador del comparativo.
  nombre_gerente: "",
  nif_gerente: "",
  // Dirección la rellena el proveedor; no prellenar.
  direccion_empresa: "",
  tipo_escritura: (validation?.prefill?.tipo_escritura as string | null) ?? "",
  fecha_escritura: (validation?.prefill?.fecha_escritura as string | null) ?? "",
  nombre_notario: (validation?.prefill?.nombre_notario as string | null) ?? "",
  num_protocolo: (validation?.prefill?.num_protocolo as string | null) ?? "",
});

const validateFile = (file: File): string | null => {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `Formato no permitido (${file.name}). Acepta: PDF, JPG, PNG, DOCX, XLSX.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `${file.name} excede 10 MB.`;
  }
  return null;
};

export const SupplierOnboardingPage: React.FC = () => {
  const router = useRouter();
  const toast = useToast();
  const token = useMemo(() => {
    const fromWindow = new URLSearchParams(window.location.search).get("token");
    if (fromWindow && fromWindow.trim().length > 0) return fromWindow.trim();
    const search = router.state.location.search as unknown;
    if (typeof search === "string") {
      const params = new URLSearchParams(search);
      return (params.get("token") ?? "").trim();
    }
    if (search && typeof search === "object" && "token" in search) {
      const value = (search as { token?: unknown }).token;
      return typeof value === "string" ? value.trim() : "";
    }
    return "";
  }, [router.state.location.search]);

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [validation, setValidation] = useState<SupplierOnboardingValidateResponse | null>(null);
  const [form, setForm] = useState<SupplierFormState>(buildFormState());
  const [docs, setDocs] = useState<Record<string, File[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loadError, setLoadError] = useState<string>("");
  const validatedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError("Falta el token en el enlace.");
      setIsLoading(false);
      return;
    }
    if (validatedTokenRef.current === token) return;
    validatedTokenRef.current = token;
    setIsLoading(true);
    setLoadError("");
    validateSupplierOnboarding(token)
      .then((data) => {
        if (!data.is_valid) {
          setValidation(data);
          setSupplier(null);
          setLoadError(data.message || "Invitacion no valida o expirada.");
          return;
        }
        setValidation(data);
        setSupplier(data.supplier);
        setForm(buildFormState(data, data.supplier));
      })
      .catch((error) => {
        const detail = getApiErrorDetail(error, "No se pudo validar la invitación del proveedor.");
        setLoadError(detail);
        toast({ title: "Enlace no válido", description: detail, status: "error" });
      })
      .finally(() => setIsLoading(false));
  }, [token, toast]);

  const isSubcontratacion = validation?.contract_type === "SUBCONTRATACION";
  const docCategories = isSubcontratacion ? DOC_CATEGORIES_SUB : DOC_CATEGORIES_BASE;

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleFilesAdd = (
    categoryKey: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const errors: string[] = [];
    const valid: File[] = [];
    for (const file of files) {
      const err = validateFile(file);
      if (err) errors.push(err);
      else valid.push(file);
    }
    if (errors.length > 0) {
      toast({
        status: "warning",
        title: "Algún archivo no se añadió",
        description: errors.join(" "),
      });
    }
    if (valid.length === 0) return;
    setDocs((prev) => {
      const current = prev[categoryKey] ?? [];
      const merged = [...current, ...valid].slice(0, MAX_FILES_PER_CATEGORY);
      if (current.length + valid.length > MAX_FILES_PER_CATEGORY) {
        toast({
          status: "warning",
          title: "Máximo 2 archivos por categoría",
          description: "Se conservaron los 2 primeros.",
        });
      }
      return { ...prev, [categoryKey]: merged };
    });
  };

  const handleFileRemove = (categoryKey: string, index: number) => {
    setDocs((prev) => {
      const current = prev[categoryKey] ?? [];
      const next = current.filter((_, i) => i !== index);
      return { ...prev, [categoryKey]: next };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !supplier) return;

    const missingText: string[] = [];
    if (!form.razon_social.trim()) missingText.push("Razón social");
    if (!form.nombre_gerente.trim()) missingText.push("Nombre persona firmante");
    if (!form.nif_gerente.trim()) missingText.push("NIF persona firmante");
    if (!form.direccion_empresa.trim()) missingText.push("Dirección de la empresa");
    if (isSubcontratacion) {
      if (!form.tipo_escritura.trim()) missingText.push("Tipo de escritura");
      if (!form.fecha_escritura.trim()) missingText.push("Fecha de escritura");
      if (!form.nombre_notario.trim()) missingText.push("Nombre del notario");
      if (!form.num_protocolo.trim()) missingText.push("Número de protocolo");
    }
    if (missingText.length > 0) {
      toast({
        status: "warning",
        title: "Faltan campos",
        description: missingText.join(", "),
      });
      return;
    }

    const missingDocs: string[] = [];
    for (const cat of docCategories) {
      const list = docs[cat.key] ?? [];
      if (list.length === 0) missingDocs.push(cat.label);
    }
    if (missingDocs.length > 0) {
      toast({
        status: "warning",
        title: "Faltan documentos",
        description: `Adjunta al menos 1 archivo en: ${missingDocs.join(", ")}.`,
      });
      return;
    }

    setIsSaving(true);
    try {
      const updated = await completeSupplierOnboarding(
        token,
        {
          razon_social: form.razon_social,
          nombre_gerente: form.nombre_gerente,
          nif_gerente: form.nif_gerente,
          direccion_empresa: form.direccion_empresa,
          tipo_escritura: isSubcontratacion ? form.tipo_escritura : "",
          fecha_escritura: isSubcontratacion ? form.fecha_escritura : "",
          nombre_notario: isSubcontratacion ? form.nombre_notario : "",
          num_protocolo: isSubcontratacion ? form.num_protocolo : "",
        },
        {
          escritura_poderes: docs.escritura_poderes ?? [],
          dni_firmante: docs.dni_firmante ?? [],
          rea: isSubcontratacion ? docs.rea ?? [] : undefined,
          cert_hacienda: isSubcontratacion ? docs.cert_hacienda ?? [] : undefined,
          cert_ss: isSubcontratacion ? docs.cert_ss ?? [] : undefined,
        },
      );
      setSupplier(updated);
      setIsSubmitted(true);
    } catch (error) {
      toast({
        title: "Error al guardar",
        description: getApiErrorDetail(error, "No se pudo enviar el formulario."),
        status: "error",
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

  if (!supplier) {
    return (
      <Box minH="100vh" display="flex" alignItems="center" justifyContent="center">
        <Stack spacing={2} textAlign="center" maxW="560px" px={6}>
          <Text fontWeight="semibold">Invitación no válida o expirada.</Text>
          {loadError ? <Text color="gray.600">{loadError}</Text> : null}
        </Stack>
      </Box>
    );
  }

  if (isSubmitted) {
    return (
      <Box minH="100vh" bg="gray.50" display="flex" alignItems="center" justifyContent="center" px={6}>
        <Box
          maxW="560px"
          w="full"
          bg="white"
          borderRadius="2xl"
          p={{ base: 8, md: 12 }}
          boxShadow="xl"
          textAlign="center"
        >
          <Stack spacing={4}>
            <Heading size="lg" color="green.600">
              Formulario enviado con éxito
            </Heading>
            <Text fontSize="md" color="gray.700">
              Gracias. La información del proveedor se ha registrado correctamente.
            </Text>
            <Text fontSize="sm" color="gray.500">
              Ya puede cerrar esta ventana.
            </Text>
          </Stack>
        </Box>
      </Box>
    );
  }

  return (
    <Box minH="100vh" bg="gray.50" py={{ base: 10, md: 16 }} px={6}>
      <Box
        maxW="1200px"
        mx="auto"
        bg="white"
        borderRadius="2xl"
        p={{ base: 6, md: 10 }}
        boxShadow="xl"
      >
        <Stack spacing={6} as="form" onSubmit={handleSubmit} noValidate>
          <Stack spacing={1}>
            <Heading size="lg">Completar datos del proveedor</Heading>
          </Stack>

          <Stack spacing={4}>
            <Heading size="sm" color="gray.700">
              Información
            </Heading>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <FormControl>
                <FormLabel>CIF / NIF de la empresa</FormLabel>
                <Input value={form.cif} isReadOnly bg="gray.50" />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Razón social</FormLabel>
                <Input
                  name="razon_social"
                  value={form.razon_social}
                  onChange={handleTextChange}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Nombre persona firmante/representante</FormLabel>
                <Input
                  name="nombre_gerente"
                  value={form.nombre_gerente}
                  onChange={handleTextChange}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>NIF persona firmante/representante</FormLabel>
                <Input
                  name="nif_gerente"
                  value={form.nif_gerente}
                  onChange={handleTextChange}
                />
              </FormControl>
            </SimpleGrid>

            <FormControl isRequired>
              <FormLabel>Dirección de la empresa</FormLabel>
              <Input
                name="direccion_empresa"
                value={form.direccion_empresa}
                onChange={handleTextChange}
              />
            </FormControl>

            {isSubcontratacion && (
              <>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  <FormControl isRequired>
                    <FormLabel>Tipo de escritura</FormLabel>
                    <Input
                      name="tipo_escritura"
                      value={form.tipo_escritura}
                      onChange={handleTextChange}
                    />
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel>Fecha de escritura</FormLabel>
                    <Input
                      name="fecha_escritura"
                      type="date"
                      value={form.fecha_escritura}
                      onChange={handleTextChange}
                    />
                  </FormControl>
                </SimpleGrid>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  <FormControl isRequired>
                    <FormLabel>Nombre del notario</FormLabel>
                    <Input
                      name="nombre_notario"
                      value={form.nombre_notario}
                      onChange={handleTextChange}
                    />
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel>Número de protocolo</FormLabel>
                    <Input
                      name="num_protocolo"
                      value={form.num_protocolo}
                      onChange={handleTextChange}
                    />
                  </FormControl>
                </SimpleGrid>
              </>
            )}
          </Stack>

          <Stack spacing={4}>
            <Heading size="sm" color="gray.700">
              Documentos
            </Heading>
            <Text fontSize="xs" color="gray.500">
              Adjunta al menos 1 archivo por categoría. Máximo 2 archivos. Formatos
              permitidos: PDF, JPG, PNG, DOCX, XLSX. Tamaño máximo 10 MB por archivo.
            </Text>

            {docCategories.map((cat) => {
              const list = docs[cat.key] ?? [];
              const inputId = `file-input-${cat.key}`;
              return (
                <FormControl isRequired key={cat.key}>
                  <FormLabel>{cat.label}</FormLabel>
                  <Stack spacing={2}>
                    {list.length > 0 && (
                      <Stack spacing={1}>
                        {list.map((file, idx) => (
                          <HStack
                            key={`${file.name}-${idx}`}
                            justify="space-between"
                            px={3}
                            py={2}
                            bg="gray.50"
                            borderRadius="md"
                            borderWidth="1px"
                            borderColor="gray.200"
                          >
                            <HStack spacing={2} minW={0}>
                              <Icon as={Paperclip} boxSize={4} color="gray.500" />
                              <Tag size="sm" colorScheme="gray" maxW="full">
                                <TagLabel isTruncated>{file.name}</TagLabel>
                              </Tag>
                              <Text fontSize="xs" color="gray.500">
                                {(file.size / 1024).toFixed(0)} KB
                              </Text>
                            </HStack>
                            <IconButton
                              aria-label="Quitar archivo"
                              size="xs"
                              variant="ghost"
                              icon={<Icon as={X} boxSize={3} />}
                              onClick={() => handleFileRemove(cat.key, idx)}
                            />
                          </HStack>
                        ))}
                      </Stack>
                    )}
                    {list.length < MAX_FILES_PER_CATEGORY && (
                      <>
                        <Input
                          id={inputId}
                          type="file"
                          accept={ALLOWED_ACCEPT}
                          multiple
                          onChange={(e) => handleFilesAdd(cat.key, e)}
                          display="none"
                        />
                        <Button
                          as="label"
                          htmlFor={inputId}
                          leftIcon={<Icon as={Upload} boxSize={4} />}
                          variant="outline"
                          size="sm"
                          cursor="pointer"
                          alignSelf="flex-start"
                        >
                          Seleccionar archivo
                        </Button>
                      </>
                    )}
                  </Stack>
                </FormControl>
              );
            })}
          </Stack>

          <Button
            type="submit"
            colorScheme="brand"
            isLoading={isSaving}
            alignSelf="flex-end"
            px={8}
          >
            Enviar
          </Button>
        </Stack>
      </Box>
    </Box>
  );
};

export default SupplierOnboardingPage;
