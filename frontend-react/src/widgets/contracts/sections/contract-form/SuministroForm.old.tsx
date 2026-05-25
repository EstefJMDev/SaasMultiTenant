/**
 * SuministroForm.old.tsx
 *
 * Snapshot del formulario SUMINISTRO antiguo extraído de ContractsModule.tsx
 * (líneas ~9113-9554). Se conserva como referencia histórica; no se importa.
 *
 * El JSX original mezclaba SUBCONTRATACION/SERVICIO/SUMINISTRO con condicionales
 * (`isSuministro ? ... : ...`). Aquí queda solo la traza de cómo se renderizaba
 * antes — el flujo nuevo vive en SuministroForm.tsx.
 *
 * Las variables y handlers (supplierName, nombreGerente, setMilestones, etc.)
 * vivían en ContractsModule.tsx y compartían estado con los otros tipos.
 */

/* eslint-disable */
// @ts-nocheck
/*
        <Section icon={<FileText size={18} />} title="Información general">
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <InputField label="ID Contrato" defaultValue={contract ? `CT-${contract.id}` : "Auto-generado"} disabled helper="Generado automáticamente" />
            <SelectField label="Tipo Documento" options={["CONTRATO"]} />
            <SelectField
              label="Tipo Contrato"
              options={["SUBCONTRATACIÓN", "SUMINISTRO", "SERVICIO"]}
              value={formatContractType(tipoContrato)}
              onChange={(e) => setTipoContrato((e.target.value as string).replace("SUBCONTRATACIÓN", "SUBCONTRATACION") as ContractType)}
            />
            <InputField label="Título" value={title} onChange={setTitle} required />
          </SimpleGrid>
        </Section>

        <Section icon={<Users size={18} />} title="Datos del proveedor">
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <InputField label="Razón social / Empresa" value={supplierName} onChange={setSupplierName} required />
            <InputField label="NIF/CIF" value={supplierTaxId} onChange={setSupplierTaxId} required />
            {isSuministro && (
              <Box gridColumn={{ base: "span 1", md: "span 2" }}>
                <InputField label="Dirección empresa" value={supplierAddress} onChange={setSupplierAddress} required fullWidth />
              </Box>
            )}
          </SimpleGrid>
        </Section>

        {isSuministro && (
          <Section icon={<User size={18} />} title="Representante">
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <InputField label="Nombre gerente" value={nombreGerente} onChange={setNombreGerente} required />
              <InputField label="NIF gerente" value={nifGerente} onChange={setNifGerente} required />
            </SimpleGrid>
          </Section>
        )}

        <Section icon={<span>⏱</span>} title="Condiciones económicas">
          {isSuministro && (
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <InputField label="Forma de pago" value={formaPagoPactadaDisplay} disabled />
              <InputField label="Término de pago" value={terminoPago} disabled />
            </SimpleGrid>
          )}
        </Section>

        <Section icon={<span>⏱</span>} title="Plazos">
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
            <InputField label="Fecha Inicio" type="date" value={startDate} onChange={setStartDate} required />
            <InputField label="Fecha Fin" type="date" value={endDate} onChange={setEndDate} required />
            {isSuministro && <InputField label="Duración" value={duracionObra} onChange={setDuracionObra} helper="Texto libre, ej: 3 meses" />}
          </SimpleGrid>
        </Section>

        {tipoContrato === "SUMINISTRO" && (
          <Section icon={<Truck size={18} />} title="Logística">
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <SelectField label="Portes" options={["URDECON", "PROVEEDOR"]} value={shippingType} onChange={(e) => setShippingType(e.target.value)} />
              <SelectField label="Descargas" options={["URDECON", "PROVEEDOR"]} value={unloadingType} onChange={(e) => setUnloadingType(e.target.value)} />
            </SimpleGrid>
          </Section>
        )}

        <Section icon={<span>⏱</span>} title="Información adicional">
          <Box>
            <Text fontSize="sm" fontWeight="semibold" mb={2}>Hitos/Fases</Text>
            <Textarea rows={3} placeholder="Definir hitos del contrato..." value={milestones} onChange={(e) => setMilestones(e.target.value)} required />
          </Box>
        </Section>
*/

export {};
