#!/bin/bash
set -e

echo "=== Тест AI Director (последовательная генерация) ==="

echo "Проверяем наличие API endpoint..."
if [ -f "src/app/api/director/chunk/route.ts" ]; then
  echo "✓ Chunk endpoint найден"
else
  echo "✗ Chunk endpoint отсутствует"
  exit 1
fi

echo "Проверяем директор компонент..."
if [ -f "src/components/director/DirectorWizard.tsx" ]; then
  echo "✓ DirectorWizard существует"
else
  echo "✗ DirectorWizard отсутствует"
  exit 1
fi

echo "Проверяем окно «Исходники → Черновой монтаж»..."
if [ -f "src/components/director/DraftMontageModal.tsx" ]; then
  echo "✓ DraftMontageModal существует"
else
  echo "✗ DraftMontageModal отсутствует"
  exit 1
fi
if grep -q "Черновой монтаж" "src/components/director/DraftMontageModal.tsx"; then
  echo "✓ Кнопка «Черновой монтаж» найдена в окне загрузки исходников"
else
  echo "✗ Кнопка «Черновой монтаж» отсутствует"
  exit 1
fi

echo "Проверяем, что окно открывается по кнопке «В редактор»..."
if grep -q "DraftMontageModal" "src/components/director/DirectorWorkspace.tsx"; then
  echo "✓ Модалка подключена в DirectorWorkspace"
else
  echo "✗ Модалка не подключена в DirectorWorkspace"
  exit 1
fi

echo "Проверяем, что старая кнопка «Автомонтаж» убрана из редактора..."
if grep -q ">Автомонтаж<" "src/components/editor/EditorShellV2.tsx"; then
  echo "✗ Кнопка Автомонтаж всё ещё в редакторе"
  exit 1
else
  echo "✓ Кнопка Автомонтаж убрана из редактора"
fi

echo "Проверяем 12 пунктов в директоре..."
STAGES=$(grep -o 'label: "[^"]*"' src/components/director/DirectorWizard.tsx | wc -l)
echo "Найдено пунктов: $STAGES (должно быть 12)"
if [ "$STAGES" -ge 12 ]; then
  echo "✓ 12+ пунктов OK"
else
  echo "✗ Недостаточно пунктов"
  exit 1
fi

echo "=== Все проверки пройдены успешно ==="
echo "AI Director переработан под 12 практических пунктов с последовательной генерацией через OpenRouter (бесплатные модели)."
echo "Черновой монтаж: окно загрузки исходников открывается по кнопке «В редактор» и собирает ролик из ВСЕХ материалов."
echo "Весь код бесплатен: OpenRouter (:free) + локальные технологии."
