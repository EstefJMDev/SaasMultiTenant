import { useState } from "react";

export const useErpTasksFilters = () => {
  const [showCreateForm, setShowCreateForm] = useState(false);

  return {
    showCreateForm,
    setShowCreateForm,
  };
};
