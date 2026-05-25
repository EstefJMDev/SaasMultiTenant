from app.domains.org.service_allocations import (  # noqa: F401
    create_employee_allocation,
    delete_employee_allocation,
    list_employee_allocations,
    update_employee_allocation,
)
from app.domains.org.service_departments import (  # noqa: F401
    create_department,
    delete_department,
    list_departments,
    update_department,
)
from app.domains.org.service_people_create_delete import (  # noqa: F401
    create_employee_profile,
    delete_employee_profile,
)
from app.domains.org.service_people_list import (  # noqa: F401
    list_directores_tecnicos,
    list_employee_profiles,
)
from app.domains.org.service_people_update import (  # noqa: F401
    update_employee_profile,
)
from app.domains.org.service_reports import (  # noqa: F401
    get_headcount_by_department,
)
