import {
  createSimulationExpense as createSimulationExpenseApi,
  createSimulationProject as createSimulationProjectApi,
  deleteSimulationExpense as deleteSimulationExpenseApi,
  deleteSimulationProject as deleteSimulationProjectApi,
  updateSimulationExpense as updateSimulationExpenseApi,
  updateSimulationProject as updateSimulationProjectApi,
} from "@api/simulations";

export const createSimulationProject = (
  ...args: Parameters<typeof createSimulationProjectApi>
) => createSimulationProjectApi(...args);

export const updateSimulationProject = (
  ...args: Parameters<typeof updateSimulationProjectApi>
) => updateSimulationProjectApi(...args);

export const deleteSimulationProject = (
  ...args: Parameters<typeof deleteSimulationProjectApi>
) => deleteSimulationProjectApi(...args);

export const createSimulationExpense = (
  ...args: Parameters<typeof createSimulationExpenseApi>
) => createSimulationExpenseApi(...args);

export const updateSimulationExpense = (
  ...args: Parameters<typeof updateSimulationExpenseApi>
) => updateSimulationExpenseApi(...args);

export const deleteSimulationExpense = (
  ...args: Parameters<typeof deleteSimulationExpenseApi>
) => deleteSimulationExpenseApi(...args);
