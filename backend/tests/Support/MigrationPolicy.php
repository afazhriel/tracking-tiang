<?php

namespace Tests\Support;

use PhpParser\Node;
use PhpParser\NodeFinder;
use PhpParser\ParserFactory;

final class MigrationPolicy
{
    /** @return list<string> */
    public static function violations(string $source): array
    {
        $nodes = (new ParserFactory)->createForNewestSupportedVersion()->parse($source);
        $finder = new NodeFinder;
        $methods = $finder->find($nodes, fn (Node $node) => $node instanceof Node\Stmt\ClassMethod && $node->name->toString() === 'up');
        if ($methods === []) {
            return ['Migration must declare an up() method.'];
        }

        $errors = [];
        foreach ($methods as $method) {
            $calls = $finder->find($method->stmts ?? [], fn (Node $node) => $node instanceof Node\Expr\MethodCall || $node instanceof Node\Expr\StaticCall);
            foreach ($calls as $call) {
                if (! $call->name instanceof Node\Identifier) {
                    $errors[] = 'Dynamic migration calls cannot be checked automatically.';

                    continue;
                }

                $name = strtolower($call->name->toString());
                if (str_starts_with($name, 'drop') || in_array($name, [
                    'delete', 'truncate', 'rename', 'renamecolumn', 'change',
                    'update', 'upsert', 'updateorinsert', 'save', 'increment', 'decrement',
                    'statement', 'unprepared', 'affectingstatement',
                ], true)) {
                    $errors[] = 'Unsafe operation in up(): '.$call->name->toString();
                }
            }
        }

        return array_values(array_unique($errors));
    }
}
