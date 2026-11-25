export const CATEGORIES = [
  { id: "moradia", label: "Moradia", essential: true },
  { id: "alimentacao", label: "Alimentação", essential: true },
  { id: "transporte", label: "Transporte", essential: true },
  { id: "contas", label: "Contas fixas", essential: true },
  { id: "saude", label: "Saúde", essential: true },
  { id: "educacao", label: "Educação", essential: true },
  { id: "restaurantes", label: "Restaurantes", essential: false },
  { id: "lazer", label: "Lazer", essential: false },
  { id: "compras", label: "Compras", essential: false },
  { id: "assinaturas", label: "Assinaturas", essential: false },
  { id: "outros", label: "Outros", essential: false },
];

export const INCOME_CATEGORIES = [
  { id: "salario", label: "Salário" },
  { id: "freelance", label: "Freelance" },
  { id: "investimentos", label: "Investimentos" },
  { id: "presente", label: "Presente" },
  { id: "outros", label: "Outros" },
];

export const CATEGORY_MAP = new Map(CATEGORIES.map((category) => [category.id, category]));
export const INCOME_CATEGORY_MAP = new Map(INCOME_CATEGORIES.map((category) => [category.id, category]));

export const SESSION_COOKIE = "noodle_session";
export const SESSION_DAYS = 30;
