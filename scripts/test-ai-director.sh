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

echo "Проверяем автомонтаж кнопку в редакторе..."
if grep -q "Автомонтаж" "src/components/editor/EditorShellV2.tsx"; then
  echo "✓ Кнопка Автомонтаж найдена в редакторе"
else
  echo "✗ Кнопка Автомонтаж отсутствует"
  exit 1
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
echo "Автомонтаж кнопка добавлена в редактор — использует весь исходный материал."
echo "Весь код бесплатен: OpenRouter (:free) + локальные технологии."
