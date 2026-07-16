from typing import Type, Any, Dict

class SnapshotBuilderRegistry:
    """
    Central registry mapping models to their audit serializers.
    Used to generate standardized snapshots for DocumentRevisionV2.
    """
    _registry = {}

    @classmethod
    def register(cls, model_class: Type, serializer_class: Type):
        cls._registry[model_class] = serializer_class

    @classmethod
    def get_serializer(cls, model_class: Type) -> Type:
        serializer = cls._registry.get(model_class)
        if not serializer:
            raise ValueError(f"No audit serializer registered for model {model_class.__name__}")
        return serializer

    @classmethod
    def build_snapshot(cls, instance: Any) -> Dict[str, Any]:
        """Builds a JSON-serializable snapshot of the model instance."""
        if instance is None:
            return {}
        serializer_class = cls.get_serializer(instance.__class__)
        serializer = serializer_class(instance)
        return serializer.data
