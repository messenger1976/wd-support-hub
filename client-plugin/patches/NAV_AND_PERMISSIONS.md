# Nav + permission snippets

Permission key: `message_support`

## responsibilities.php `module_name()`

```php
'message_support' => 'Message Support',
```

## responsibilities.php `module_groups()` (after Technical Problems)

```php
array(
	'id' => 'support',
	'label' => 'Support',
	'icon' => 'fa-comments',
	'parent_key' => 'message_support',
	'children' => array()
),
```

## responsibilities_model.php `module_name()`

```php
'message_support' => '0',
```

## adminheader_model.php `module_name()`

```php
'message_support' => 'Message Support',
```

## navigation.php (after Technical Problems)

Gate: `message_support == 1` or `usertype == 'admin'`.

URL: `ADMIN_URL.'messagesupport'`
