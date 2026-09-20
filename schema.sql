create table if not exists medicamentos_controlados (
  id serial primary key,
  nome_medicamento text not null,
  principio_ativo text,
  lista text not null, -- A1, A2, A3, B1, B2, C1, C5, ANTIMICROBIANO, GLP1
  created_at timestamp with time zone default now()
);

create index if not exists idx_nome_medicamento on medicamentos_controlados (lower(nome_medicamento));

insert into medicamentos_controlados (nome_medicamento, principio_ativo, lista) values
('Morfina', 'sulfato de morfina', 'A1'),
('Metadona', 'cloridrato de metadona', 'A1'),
('Fentanila', 'citrato de fentanila', 'A1'),
('Codeína', 'fosfato de codeína', 'A1'),
('Clonazepam', 'clonazepam', 'B1'),
('Diazepam', 'diazepam', 'B1'),
('Alprazolam', 'alprazolam', 'B1'),
('Sibutramina', 'sibutramina', 'B2'),
('Tramadol', 'cloridrato de tramadol', 'C1'),
('Gabapentina', 'gabapentina', 'C1'),
('Pregabalina', 'pregabalina', 'C1'),
('Zolpidem', 'zolpidem', 'C1'),
('Fenobarbital', 'fenobarbital', 'C1'),
('Durateston', 'testosterona', 'C5'),
('Stanozolol', 'estanozolol', 'C5'),
('Oxandrolona', 'oxandrolona', 'C5'),
('Amoxicilina', 'amoxicilina', 'ANTIMICROBIANO'),
('Azitromicina', 'azitromicina', 'ANTIMICROBIANO'),
('Ciprofloxacino', 'ciprofloxacino', 'ANTIMICROBIANO'),
('Cefalexina', 'cefalexina', 'ANTIMICROBIANO'),
('Ozempic', 'semaglutida', 'GLP1'),
('Wegovy', 'semaglutida', 'GLP1'),
('Rybelsus', 'semaglutida', 'GLP1'),
('Mounjaro', 'tirzepatida', 'GLP1'),
('Saxenda', 'liraglutida', 'GLP1'),
('Victoza', 'liraglutida', 'GLP1'),
('Trulicity', 'dulaglutida', 'GLP1');
