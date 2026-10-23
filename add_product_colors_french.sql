-- product_colors jadvaliga Fransuz tili (name_fr) ustunini qo'shish
ALTER TABLE product_colors ADD COLUMN IF NOT EXISTS name_fr text;

-- Fransuzcha tarjimalarni to'ldirish
UPDATE product_colors SET name_fr = 'Antique' WHERE name = 'Antik';
UPDATE product_colors SET name_fr = 'Doré' WHERE name = 'gold';
UPDATE product_colors SET name_fr = 'Asphalte mouillé (41482)' WHERE name = 'ho''l asfalt (41482)';
UPDATE product_colors SET name_fr = 'Café' WHERE name = 'kofe';
UPDATE product_colors SET name_fr = 'Café (40744)' WHERE name = 'kofe(40744)';
UPDATE product_colors SET name_fr = 'Argent (doré)' WHERE name = 'kumush(tilla)';
UPDATE product_colors SET name_fr = 'Framboise' WHERE name = 'Malina';
UPDATE product_colors SET name_fr = 'Mixte' WHERE name = 'miks';
UPDATE product_colors SET name_fr = 'Cuivre' WHERE name = 'Mis';
UPDATE product_colors SET name_fr = 'Asphalte mouillé (41482)' WHERE name = 'mokriy (41482)';
UPDATE product_colors SET name_fr = 'Ambre' WHERE name = 'novot';
UPDATE product_colors SET name_fr = 'Ambre (41067)' WHERE name = 'novot (41067)';
UPDATE product_colors SET name_fr = 'Abricot' WHERE name = 'O''rik';
UPDATE product_colors SET name_fr = 'Café clair' WHERE name = 'och kofe';
UPDATE product_colors SET name_fr = 'Beige (40752)' WHERE name = 'och kofe(40752)';
UPDATE product_colors SET name_fr = 'Doré' WHERE name = 'Oltin';
UPDATE product_colors SET name_fr = 'Blanc' WHERE name = 'Oq';
UPDATE product_colors SET name_fr = 'Blanc (40447)' WHERE name = 'oq(40447)';
UPDATE product_colors SET name_fr = 'Rose' WHERE name = 'Pushti';
UPDATE product_colors SET name_fr = 'Crème' WHERE name = 'qaymoq';
UPDATE product_colors SET name_fr = 'Crème (41458)' WHERE name = 'qaymoq (41458)';
UPDATE product_colors SET name_fr = 'Noir' WHERE name = 'Qora';
UPDATE product_colors SET name_fr = 'Gris' WHERE name = 'seriy';
UPDATE product_colors SET name_fr = 'Gris (40823)' WHERE name = 'seriy(40823)';
UPDATE product_colors SET name_fr = 'Gris + anthracite' WHERE name = 'seriy+mokriy';
UPDATE product_colors SET name_fr = 'Pêche' WHERE name = 'Shaftoli';
UPDATE product_colors SET name_fr = 'Champagne' WHERE name = 'shampan';
UPDATE product_colors SET name_fr = 'Doré' WHERE name = 'Tilla';
UPDATE product_colors SET name_fr = 'Doré (40686)' WHERE name = 'Tilla (40686)';
UPDATE product_colors SET name_fr = 'Doré + crème' WHERE name = 'Tilla + Qaymoq';
UPDATE product_colors SET name_fr = 'Doré + noir' WHERE name = 'Tilla + Qora';
UPDATE product_colors SET name_fr = 'Bleu marine' WHERE name = 'To''q ko''k';
UPDATE product_colors SET name_fr = 'Café foncé' WHERE name = 'To''q kofe';
UPDATE product_colors SET name_fr = 'Gris foncé' WHERE name = 'To''q kulrang';
UPDATE product_colors SET name_fr = 'Chrome' WHERE name = 'xrom';
